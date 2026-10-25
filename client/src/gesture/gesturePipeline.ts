import { classifyPose, combinePoses, PoseSmoother } from "./poseClassifier";
import { filterHands, HandStabilizer } from "./handTracking";
import { PumpCounter } from "./pumpCounter";
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
  private pumps = new PumpCounter();
  /** During a spell struggle, hands pump to push instead of casting. */
  private struggling = false;
  private gestureState: GestureState = { kind: "IDLE" };

  constructor(private readonly timings: GestureTimings = DEFAULT_TIMINGS) {}

  get stateKind(): GestureState["kind"] | "STRUGGLE" {
    return this.struggling ? "STRUGGLE" : this.gestureState.kind;
  }

  step(raw: Landmark[][], handedness: (Handedness | undefined)[], now: number): PipelineFrame {
    const hands = this.stabilizer.update(filterHands(raw), now);
    // Handedness is only meaningful for one-hand gestures.
    const hand = hands.length === 1 && raw.length === 1 ? handedness[0] : undefined;
    const rawPose = combinePoses(hands.map(classifyPose));
    const pose = this.smoother.push(rawPose);

    if (this.struggling) {
      return { hands, pose, rawPose, hand, actions: this.pumps.update(rawPose) ? ["STRUGGLE_PUSH"] : [] };
    }
    const { state, actions } = stepGesture(this.gestureState, pose, now, this.timings);
    this.gestureState = state;
    return { hands, pose, rawPose, hand, actions };
  }

  /** Switch between casting and spell-struggle pumping. Returns actions that close out a half-made gesture. */
  setStruggling(on: boolean): GestureAction[] {
    if (on === this.struggling) return [];
    this.struggling = on;
    this.pumps.reset();
    // Entering: drop any half-made gesture. Leaving: hands are mid-pump, so wait for them to relax before casting again.
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
