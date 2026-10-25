import { classifyPose, combinePoses, isShieldStance, PoseSmoother } from "./poseClassifier";
import { filterHands, HandStabilizer } from "./handTracking";
import { DEFAULT_TIMINGS, resetGesture, stepGesture, type GestureState, type GestureTimings } from "./gestureStateMachine";
import type { GestureAction, Handedness, HandPose, Landmark } from "./types";

export interface PipelineFrame {
  /** Stabilized hands (0–2). */
  hands: Landmark[][];
  pose: HandPose;
  rawPose: HandPose;
  hand: Handedness | undefined;
  actions: GestureAction[];
}

/**
 * Landmarker output → actions, one frame at a time. Shared by the live controller and
 * the recording replay, so recorded sessions run through exactly the code players use.
 */
export class GesturePipeline {
  /** 4-of-6 frame vote: a pose has to persist ~130 ms at 30 fps, which filters single-frame misreads. */
  private smoother = new PoseSmoother(6, 4);
  private stabilizer = new HandStabilizer();
  /** During a collision challenge, the circle tracker supplies charges and hand casting is suspended. */
  private struggling = false;
  private gestureState: GestureState = { kind: "IDLE" };

  constructor(private readonly timings: GestureTimings = DEFAULT_TIMINGS) {}

  get stateKind(): GestureState["kind"] | "STRUGGLE" {
    return this.struggling ? "STRUGGLE" : this.gestureState.kind;
  }

  /** With `casting` off (a pose race), hands are still tracked and classified but the gesture state is left alone. */
  step(raw: Landmark[][], handedness: (Handedness | undefined)[], now: number, casting = true): PipelineFrame {
    const hands = this.stabilizer.update(filterHands(raw), now);
    // Handedness is only meaningful for one-hand gestures.
    const hand = hands.length === 1 && raw.length === 1 ? handedness[0] : undefined;
    const combined = combinePoses(hands.map(classifyPose));
    // Open hands that aren't held up like a shield still release a fireball, but never cast a shield.
    const rawPose = combined === "BOTH_PALMS" && !isShieldStance(hands) ? "OPEN_PALM" : combined;
    const pose = this.smoother.push(rawPose);

    if (!casting) return { hands, pose, rawPose, hand, actions: [] };
    if (this.struggling) {
      return { hands, pose, rawPose, hand, actions: [] };
    }
    const { state, actions } = stepGesture(this.gestureState, pose, now, this.timings);
    this.gestureState = state;
    return { hands, pose, rawPose, hand, actions };
  }

  /** Switch between casting and the Charge your magic challenge. Returns actions that close out a half-made gesture. */
  setStruggling(on: boolean): GestureAction[] {
    if (on === this.struggling) return [];
    this.struggling = on;
    // Entering: drop any half-made gesture. Leaving: hands are mid-motion, so wait for them to relax before casting again.
    const actions = this.reset();
    if (!on) this.gestureState = { kind: "REARM", blockedPoses: ["FIST", "BOTH_FISTS", "OPEN_PALM", "BOTH_PALMS", "POINT"] };
    return actions;
  }

  /** Forces CHARGE_CANCEL (returned) so the game never shows a dangling charge. */
  reset(): GestureAction[] {
    const actions = resetGesture(this.gestureState);
    this.gestureState = { kind: "IDLE" };
    this.smoother.reset();
    this.stabilizer.reset();
    return actions;
  }
}
