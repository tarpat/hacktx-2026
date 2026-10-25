import { GesturePipeline } from "./gesturePipeline";
import type { RawDetection } from "./GestureController";
import type { GestureAction, HandPose } from "./types";

/** What each recording should produce. "idle" is hands moving around without casting: it should produce nothing. */
export const RECORDING_TARGETS = {
  fireball: "FIREBALL_CAST",
  shield: "SHIELD_CAST",
  ice: "ICE_CAST",
  taurus: "TAURUS_CAST",
  ultimate: "ULTIMATE_CAST",
  idle: null,
} as const satisfies Record<string, GestureAction | null>;

export type RecordingLabel = keyof typeof RECORDING_TARGETS;

/** Raw landmarker frames from the gesture test page. Landmarks only: no video ever leaves the browser. */
export interface GestureRecording {
  version: 1;
  label: RecordingLabel;
  /** How many times the player performed the gesture. */
  reps: number;
  recordedAt: string;
  userAgent: string;
  frames: RawDetection[];
  /** What the live pipeline emitted while recording. */
  actions: { timestampMs: number; action: GestureAction }[];
}

/** Dev server endpoint (see vite.config.ts) that saves recordings to client/test/fixtures/gestures. */
export const RECORDING_ENDPOINT = "/__gesture-recordings";

/** Rounds landmarks to 4 decimals (sub-pixel at 640×480) to keep files small. */
export function compactDetection(detection: RawDetection): RawDetection {
  const round = (n: number) => Math.round(n * 1e4) / 1e4;
  return {
    timestampMs: Math.round(detection.timestampMs * 10) / 10,
    landmarks: detection.landmarks.map((hand) => hand.map(({ x, y, z }) => ({ x: round(x), y: round(y), z: round(z) }))),
    handedness: detection.handedness,
  };
}

export interface ReplayResult {
  actions: { timestampMs: number; action: GestureAction }[];
  frames: { timestampMs: number; hands: number; rawPose: HandPose; pose: HandPose }[];
}

/** Runs a recording through the same pipeline the game uses. */
export function replay(recording: GestureRecording, pipeline = new GesturePipeline()): ReplayResult {
  const result: ReplayResult = { actions: [], frames: [] };
  for (const { timestampMs, landmarks, handedness } of recording.frames) {
    const frame = pipeline.step(landmarks, handedness, timestampMs);
    result.frames.push({ timestampMs, hands: frame.hands.length, rawPose: frame.rawPose, pose: frame.pose });
    for (const action of frame.actions) result.actions.push({ timestampMs, action });
  }
  return result;
}
