import type { GestureAction, HandPose } from "./types";

export interface GestureTimings {
  /** Fist must be held this long before charging starts. */
  fistStableMs: number;
  /** Minimum charge time for an open palm to count as a cast. */
  minChargeMs: number;
  /** Charge auto-cancels after this long. */
  maxChargeMs: number;
  /** After the fist is lost, an open palm within this window still casts. */
  releaseWindowMs: number;
  /** Open palm (without a preceding charge) must be held this long to raise a shield. */
  shieldHoldMs: number;
  /** Shield tolerates the palm disappearing for this long before ending. */
  shieldGraceMs: number;
  /** Local debounce after a cast. Server cooldowns are separate and authoritative. */
  recoveryMs: number;
}

export const DEFAULT_TIMINGS: GestureTimings = {
  fistStableMs: 200,
  minChargeMs: 300,
  maxChargeMs: 1800,
  releaseWindowMs: 600,
  shieldHoldMs: 350,
  shieldGraceMs: 150,
  recoveryMs: 300,
};

export type GestureState =
  | { kind: "IDLE" }
  | { kind: "FIST_PENDING"; since: number }
  | { kind: "CHARGING"; since: number }
  | { kind: "RELEASE_WINDOW"; chargeSince: number; lostAt: number }
  | { kind: "RECOVERY"; until: number }
  | { kind: "PALM_PENDING"; since: number }
  | { kind: "SHIELD_ACTIVE"; lastPalmAt: number }
  /** Wait for the hand to leave these poses before they can trigger again (e.g. after a timed-out charge). */
  | { kind: "REARM"; blockedPoses: HandPose[] };

export interface StepResult {
  state: GestureState;
  actions: GestureAction[];
}

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
      if (pose === "FIST") return { state: { kind: "FIST_PENDING", since: now }, actions: [] };
      if (pose === "OPEN_PALM") return { state: { kind: "PALM_PENDING", since: now }, actions: [] };
      return { state, actions: [] };

    case "FIST_PENDING":
      if (pose !== "FIST") return stepGesture({ kind: "IDLE" }, pose, now, t);
      if (now - state.since >= t.fistStableMs) {
        return { state: { kind: "CHARGING", since: now }, actions: ["FIREBALL_CHARGE_START"] };
      }
      return { state, actions: [] };

    case "CHARGING":
      if (now - state.since > t.maxChargeMs) {
        return { state: { kind: "REARM", blockedPoses: ["FIST", "OPEN_PALM"] }, actions: ["FIREBALL_CHARGE_CANCEL"] };
      }
      if (pose === "FIST") return { state, actions: [] };
      if (pose === "OPEN_PALM") return release(state.since, now, t);
      // Opening a hand usually passes through a few ambiguous frames.
      return { state: { kind: "RELEASE_WINDOW", chargeSince: state.since, lostAt: now }, actions: [] };

    case "RELEASE_WINDOW":
      if (pose === "OPEN_PALM") return release(state.chargeSince, now, t);
      if (pose === "FIST") return { state: { kind: "CHARGING", since: state.chargeSince }, actions: [] };
      if (now - state.lostAt > t.releaseWindowMs) {
        return { state: { kind: "IDLE" }, actions: ["FIREBALL_CHARGE_CANCEL"] };
      }
      return { state, actions: [] };

    case "RECOVERY":
      // A palm still open from the cast must not turn into a shield.
      if (now >= state.until && pose !== "OPEN_PALM") return stepGesture({ kind: "IDLE" }, pose, now, t);
      return { state, actions: [] };

    case "PALM_PENDING":
      if (pose !== "OPEN_PALM") return stepGesture({ kind: "IDLE" }, pose, now, t);
      if (now - state.since >= t.shieldHoldMs) {
        return { state: { kind: "SHIELD_ACTIVE", lastPalmAt: now }, actions: ["SHIELD_START"] };
      }
      return { state, actions: [] };

    case "SHIELD_ACTIVE":
      if (pose === "OPEN_PALM") return { state: { kind: "SHIELD_ACTIVE", lastPalmAt: now }, actions: [] };
      if (now - state.lastPalmAt > t.shieldGraceMs) {
        return { state: { kind: "REARM", blockedPoses: ["OPEN_PALM"] }, actions: ["SHIELD_END"] };
      }
      return { state, actions: [] };

    case "REARM":
      if (state.blockedPoses.includes(pose)) return { state, actions: [] };
      return stepGesture({ kind: "IDLE" }, pose, now, t);
  }
}

function release(chargeSince: number, now: number, t: GestureTimings): StepResult {
  if (now - chargeSince < t.minChargeMs) {
    return { state: { kind: "REARM", blockedPoses: ["OPEN_PALM"] }, actions: ["FIREBALL_CHARGE_CANCEL"] };
  }
  return { state: { kind: "RECOVERY", until: now + t.recoveryMs }, actions: ["FIREBALL_CAST"] };
}

/** Actions needed to cleanly close out a state on Stop / camera loss. */
export function resetGesture(state: GestureState): GestureAction[] {
  if (state.kind === "SHIELD_ACTIVE") return ["SHIELD_END"];
  if (state.kind === "CHARGING" || state.kind === "RELEASE_WINDOW") return ["FIREBALL_CHARGE_CANCEL"];
  return [];
}
