import type { GestureAction, HandPose } from "./types";

/** A fist charge becomes Fulmen once both fists are seen. */
export type ChargeKind = "fireball" | "ultimate";

export interface ChargeTimings {
  /** Minimum charge time before an open hand counts as a cast. */
  minMs: number;
  /** Charge auto-cancels after this long. */
  maxMs: number;
}

export interface GestureTimings {
  /** Fist must be held this long before charging starts. */
  fistStableMs: number;
  charge: Record<ChargeKind, ChargeTimings>;
  /** After the fist is lost, an open palm within this window still casts. */
  releaseWindowMs: number;
  /** Local debounce after a cast. Server cooldowns are separate and authoritative. */
  recoveryMs: number;
  /** How long each one-shot pose must be held before its spell casts. */
  holdMs: Record<HoldPose, number>;
}

/** Poses that cast a spell by simply being held (no charge/release). */
export type HoldPose = "OPEN_PALM" | "VICTORY";

export const HOLD_ACTIONS: Record<HoldPose, GestureAction> = {
  OPEN_PALM: "SHIELD_CAST",
  VICTORY: "ICE_CAST",
};

/** After a hold spell, these poses stay inert until the hands leave them. */
const REARM_BLOCKS: Record<HoldPose, HandPose[]> = {
  OPEN_PALM: ["OPEN_PALM", "BOTH_PALMS"],
  VICTORY: ["VICTORY"],
};

export const DEFAULT_TIMINGS: GestureTimings = {
  fistStableMs: 200,
  charge: {
    fireball: { minMs: 300, maxMs: 1800 },
    ultimate: { minMs: 600, maxMs: 2500 },
  },
  releaseWindowMs: 600,
  recoveryMs: 300,
  holdMs: { OPEN_PALM: 250, VICTORY: 300 },
};

export type GestureState =
  | { kind: "IDLE" }
  | { kind: "FIST_PENDING"; since: number; charge: ChargeKind }
  | { kind: "CHARGING"; since: number; charge: ChargeKind }
  | { kind: "RELEASE_WINDOW"; since: number; charge: ChargeKind; lostAt: number }
  | { kind: "RECOVERY"; until: number }
  | { kind: "HOLD_PENDING"; pose: HoldPose; since: number }
  /** Wait for the hand to leave these poses before they can trigger again (e.g. after a timed-out charge). */
  | { kind: "REARM"; blockedPoses: HandPose[] };

export interface StepResult {
  state: GestureState;
  actions: GestureAction[];
}

const isHoldPose = (pose: HandPose): pose is HoldPose => pose in HOLD_ACTIONS;
const isFist = (pose: HandPose) => pose === "FIST" || pose === "BOTH_FISTS";
const isPalm = (pose: HandPose) => pose === "OPEN_PALM" || pose === "BOTH_PALMS";
const ALL_FIST_AND_PALM: HandPose[] = ["FIST", "BOTH_FISTS", "OPEN_PALM", "BOTH_PALMS"];

/** Seeing both fists at any point upgrades the charge; it never downgrades. */
const chargeFor = (current: ChargeKind, pose: HandPose): ChargeKind => (pose === "BOTH_FISTS" ? "ultimate" : current);

/**
 * Pure transition function: feed it smoothed poses with monotonic timestamps.
 * Every action is emitted on a transition, never per frame.
 */
export function stepGesture(
  state: GestureState,
  pose: HandPose,
  now: number,
  t: GestureTimings = DEFAULT_TIMINGS,
): StepResult {
  switch (state.kind) {
    case "IDLE":
      if (isFist(pose)) return { state: { kind: "FIST_PENDING", since: now, charge: chargeFor("fireball", pose) }, actions: [] };
      if (isHoldPose(pose)) return { state: { kind: "HOLD_PENDING", pose, since: now }, actions: [] };
      return { state, actions: [] };

    case "FIST_PENDING": {
      if (!isFist(pose)) return stepGesture({ kind: "IDLE" }, pose, now, t);
      const charge = chargeFor(state.charge, pose);
      if (now - state.since >= t.fistStableMs) {
        return { state: { kind: "CHARGING", since: now, charge }, actions: [startAction(charge)] };
      }
      return { state: { ...state, charge }, actions: [] };
    }

    case "CHARGING": {
      if (now - state.since > t.charge[state.charge].maxMs) {
        return { state: { kind: "REARM", blockedPoses: ALL_FIST_AND_PALM }, actions: ["CHARGE_CANCEL"] };
      }
      if (isFist(pose)) return upgrade(state, pose);
      if (isPalm(pose)) return release(state.since, state.charge, pose, now, t);
      // Opening hands usually passes through a few ambiguous frames.
      return { state: { kind: "RELEASE_WINDOW", since: state.since, charge: state.charge, lostAt: now }, actions: [] };
    }

    case "RELEASE_WINDOW":
      if (isPalm(pose)) return release(state.since, state.charge, pose, now, t);
      if (isFist(pose)) return upgrade({ kind: "CHARGING", since: state.since, charge: state.charge }, pose);
      if (now - state.lostAt > t.releaseWindowMs) {
        return { state: { kind: "IDLE" }, actions: ["CHARGE_CANCEL"] };
      }
      return { state, actions: [] };

    case "RECOVERY":
      // Palms still open from the cast must not turn into a shield.
      if (now >= state.until && !isPalm(pose)) return stepGesture({ kind: "IDLE" }, pose, now, t);
      return { state, actions: [] };

    case "HOLD_PENDING":
      if (pose !== state.pose) return stepGesture({ kind: "IDLE" }, pose, now, t);
      if (now - state.since >= t.holdMs[state.pose]) {
        return { state: { kind: "REARM", blockedPoses: REARM_BLOCKS[state.pose] }, actions: [HOLD_ACTIONS[state.pose]] };
      }
      return { state, actions: [] };

    case "REARM":
      if (state.blockedPoses.includes(pose)) return { state, actions: [] };
      return stepGesture({ kind: "IDLE" }, pose, now, t);
  }
}

const startAction = (charge: ChargeKind): GestureAction => (charge === "ultimate" ? "ULTIMATE_CHARGE_START" : "FIREBALL_CHARGE_START");

/** A second fist mid-charge turns a fireball into Fulmen (one hand always curls a moment before the other). */
function upgrade(state: Extract<GestureState, { kind: "CHARGING" }>, pose: HandPose): StepResult {
  const charge = chargeFor(state.charge, pose);
  if (charge === state.charge) return { state, actions: [] };
  return { state: { ...state, charge }, actions: ["ULTIMATE_CHARGE_START"] };
}

function release(since: number, charge: ChargeKind, pose: HandPose, now: number, t: GestureTimings): StepResult {
  // Opening both hands means Fulmen even if the second fist was never cleanly seen.
  const kind: ChargeKind = pose === "BOTH_PALMS" ? "ultimate" : charge;
  if (now - since < t.charge[kind].minMs) {
    return { state: { kind: "REARM", blockedPoses: ["OPEN_PALM", "BOTH_PALMS"] }, actions: ["CHARGE_CANCEL"] };
  }
  return { state: { kind: "RECOVERY", until: now + t.recoveryMs }, actions: [kind === "ultimate" ? "ULTIMATE_CAST" : "FIREBALL_CAST"] };
}

/** Actions needed to cleanly close out a state on Stop / camera loss. */
export function resetGesture(state: GestureState): GestureAction[] {
  if (state.kind === "CHARGING" || state.kind === "RELEASE_WINDOW") return ["CHARGE_CANCEL"];
  return [];
}
