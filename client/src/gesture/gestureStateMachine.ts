import type { GestureAction, HandPose } from "./types";

/** Fireball charges on a fist; Fulmen charges on a finger pointed at the sky. */
export type ChargeKind = "fireball" | "ultimate";

export interface ChargeTimings {
  /** Minimum charge time before a release counts as a cast. */
  minMs: number;
  /** Charge auto-cancels after this long. */
  maxMs: number;
}

export interface GestureTimings {
  /** The charge pose must be held this long before charging starts. */
  fistStableMs: number;
  charge: Record<ChargeKind, ChargeTimings>;
  /** After the fist is lost, an open palm within this window still casts. */
  releaseWindowMs: number;
  /** Lowering the pointed finger casts Fulmen once it has been gone this long. */
  pointDropMs: number;
  /** Local debounce after a cast. Server cooldowns are separate and authoritative. */
  recoveryMs: number;
  /** How long each one-shot pose must be held before its spell casts. */
  holdMs: Record<HoldPose, number>;
}

/** Poses that cast a spell by simply being held (no charge/release). */
export type HoldPose = "BOTH_PALMS" | "VICTORY";

export const HOLD_ACTIONS: Record<HoldPose, GestureAction> = {
  BOTH_PALMS: "SHIELD_CAST",
  VICTORY: "ICE_CAST",
};

/** After a hold spell, these poses stay inert until the hands leave them. */
const REARM_BLOCKS: Record<HoldPose, HandPose[]> = {
  BOTH_PALMS: ["OPEN_PALM", "BOTH_PALMS"],
  VICTORY: ["VICTORY"],
};

export const DEFAULT_TIMINGS: GestureTimings = {
  fistStableMs: 200,
  charge: {
    fireball: { minMs: 300, maxMs: 1800 },
    ultimate: { minMs: 600, maxMs: 2500 },
  },
  releaseWindowMs: 600,
  pointDropMs: 150,
  recoveryMs: 300,
  holdMs: { BOTH_PALMS: 250, VICTORY: 300 },
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
/** The pose that starts and sustains each charge. */
const holdsCharge = (charge: ChargeKind, pose: HandPose) => (charge === "ultimate" ? pose === "POINT" : isFist(pose));
const chargeFor = (pose: HandPose): ChargeKind | null => (pose === "POINT" ? "ultimate" : isFist(pose) ? "fireball" : null);
const CHARGE_BLOCKS: Record<ChargeKind, HandPose[]> = {
  fireball: ["FIST", "BOTH_FISTS", "OPEN_PALM", "BOTH_PALMS"],
  ultimate: ["POINT"],
};

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
    case "IDLE": {
      const charge = chargeFor(pose);
      if (charge) return { state: { kind: "FIST_PENDING", since: now, charge }, actions: [] };
      if (isHoldPose(pose)) return { state: { kind: "HOLD_PENDING", pose, since: now }, actions: [] };
      return { state, actions: [] };
    }

    case "FIST_PENDING":
      if (!holdsCharge(state.charge, pose)) return stepGesture({ kind: "IDLE" }, pose, now, t);
      if (now - state.since >= t.fistStableMs) {
        return { state: { kind: "CHARGING", since: now, charge: state.charge }, actions: [startAction(state.charge)] };
      }
      return { state, actions: [] };

    case "CHARGING":
      if (now - state.since > t.charge[state.charge].maxMs) {
        return { state: { kind: "REARM", blockedPoses: CHARGE_BLOCKS[state.charge] }, actions: ["CHARGE_CANCEL"] };
      }
      if (holdsCharge(state.charge, pose)) return { state, actions: [] };
      if (state.charge === "fireball" && isPalm(pose)) return release(state.since, state.charge, now, t);
      // Opening hands (or lowering a finger) usually passes through a few ambiguous frames.
      return { state: { kind: "RELEASE_WINDOW", since: state.since, charge: state.charge, lostAt: now }, actions: [] };

    case "RELEASE_WINDOW":
      if (holdsCharge(state.charge, pose)) return { state: { kind: "CHARGING", since: state.since, charge: state.charge }, actions: [] };
      if (state.charge === "ultimate") {
        // Any move away from the pointed finger strikes: down, open, out of frame.
        return now - state.lostAt >= t.pointDropMs ? release(state.since, state.charge, now, t) : { state, actions: [] };
      }
      if (isPalm(pose)) return release(state.since, state.charge, now, t);
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

function release(since: number, charge: ChargeKind, now: number, t: GestureTimings): StepResult {
  if (now - since < t.charge[charge].minMs) {
    return { state: { kind: "REARM", blockedPoses: CHARGE_BLOCKS[charge] }, actions: ["CHARGE_CANCEL"] };
  }
  return { state: { kind: "RECOVERY", until: now + t.recoveryMs }, actions: [charge === "ultimate" ? "ULTIMATE_CAST" : "FIREBALL_CAST"] };
}

/** Actions needed to cleanly close out a state on Stop / camera loss. */
export function resetGesture(state: GestureState): GestureAction[] {
  if (state.kind === "CHARGING" || state.kind === "RELEASE_WINDOW") return ["CHARGE_CANCEL"];
  return [];
}
