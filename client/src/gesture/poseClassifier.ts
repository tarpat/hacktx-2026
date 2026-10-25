import type { HandPose, Landmark } from "./types";

// MediaPipe hand landmark indices: [pip, tip] per non-thumb finger.
const FINGERS = {
  index: [6, 8],
  middle: [10, 12],
  ring: [14, 16],
  pinky: [18, 20],
} as const;
const WRIST = 0;

/**
 * A finger counts as extended when its tip is meaningfully farther from the wrist
 * than its PIP joint. Comparing two distances on the same hand makes this
 * independent of hand size and camera distance.
 */
const EXTENDED_RATIO = 1.15;
const CURLED_RATIO = 1.0;

type FingerState = "extended" | "curled" | "ambiguous";

function dist(a: Landmark, b: Landmark) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function fingerState(landmarks: Landmark[], [pip, tip]: readonly [number, number]): FingerState {
  const wrist = landmarks[WRIST];
  const ratio = dist(wrist, landmarks[tip]) / dist(wrist, landmarks[pip]);
  if (ratio >= EXTENDED_RATIO) return "extended";
  if (ratio <= CURLED_RATIO) return "curled";
  return "ambiguous";
}

export function classifyPose(landmarks: Landmark[] | undefined): HandPose {
  if (!landmarks || landmarks.length < 21) return "NONE";
  const index = fingerState(landmarks, FINGERS.index);
  const middle = fingerState(landmarks, FINGERS.middle);
  const ring = fingerState(landmarks, FINGERS.ring);
  const pinky = fingerState(landmarks, FINGERS.pinky);
  const all = [index, middle, ring, pinky];

  if (all.every((s) => s === "curled")) return "FIST";
  if (all.every((s) => s === "extended")) return "OPEN_PALM";
  if (index === "extended" && middle === "extended" && ring === "curled" && pinky === "curled") return "VICTORY";
  if (index === "extended" && middle === "curled" && ring === "curled" && pinky === "curled") return "POINT";
  if (index === "extended" && middle === "curled" && ring === "curled" && pinky === "extended") return "HORNS";
  return "UNKNOWN";
}

const isClear = (pose: HandPose) => pose !== "NONE" && pose !== "UNKNOWN";

/**
 * Merge per-hand poses into the one pose the state machine sees.
 * A relaxed or missing second hand never blocks a one-hand gesture; two clear but
 * different poses are ambiguous, so nothing casts.
 */
export function combinePoses(poses: HandPose[]): HandPose {
  const clear = poses.filter(isClear);
  if (clear.length === 0) return poses.includes("UNKNOWN") ? "UNKNOWN" : "NONE";
  if (clear.length === 1) return clear[0];
  const [a, b] = clear;
  if (a !== b) return "UNKNOWN";
  if (a === "FIST") return "BOTH_FISTS";
  if (a === "OPEN_PALM") return "BOTH_PALMS";
  return a;
}

/** Shield-stance limits, tuned on recordings in test/fixtures/gestures (real shields: tilt ≤ 11°, size ratio ≥ 0.93). */
const SHIELD_MAX_TILT_DEG = 25;
const SHIELD_MIN_SIZE_RATIO = 0.8;
const MIDDLE_MCP = 9;
const THUMB_TIP = 4;
const PINKY_TIP = 20;

/**
 * Two open hands only count as a shield when held up like one: fingers pointing up,
 * both hands at the same distance from the camera, palms facing it (thumbs toward each other).
 * Open hands while talking or resting fail at least one of these; without it they cast shields.
 */
export function isShieldStance(hands: Landmark[][]): boolean {
  if (hands.length !== 2) return false;
  const [a, b] = hands;
  const size = (h: Landmark[]) => Math.hypot(h[MIDDLE_MCP].x - h[WRIST].x, h[MIDDLE_MCP].y - h[WRIST].y);
  const upright = (h: Landmark[]) =>
    Math.abs(Math.atan2(h[MIDDLE_MCP].x - h[WRIST].x, h[WRIST].y - h[MIDDLE_MCP].y)) * (180 / Math.PI) <= SHIELD_MAX_TILT_DEG;
  const thumbInward = (h: Landmark[], other: Landmark[]) => Math.abs(h[THUMB_TIP].x - other[WRIST].x) < Math.abs(h[PINKY_TIP].x - other[WRIST].x);
  return (
    upright(a) &&
    upright(b) &&
    Math.min(size(a), size(b)) / Math.max(size(a), size(b)) >= SHIELD_MIN_SIZE_RATIO &&
    thumbInward(a, b) &&
    thumbInward(b, a)
  );
}

/** Majority vote over a short window so single-frame flicker never changes the pose. */
export class PoseSmoother {
  private window: HandPose[] = [];

  constructor(private readonly size = 5, private readonly minVotes = 3) {}

  push(pose: HandPose): HandPose {
    this.window.push(pose);
    if (this.window.length > this.size) this.window.shift();
    const counts = new Map<HandPose, number>();
    for (const p of this.window) counts.set(p, (counts.get(p) ?? 0) + 1);
    let best: HandPose = "UNKNOWN";
    let bestCount = 0;
    for (const [p, c] of counts) if (c > bestCount) [best, bestCount] = [p, c];
    return bestCount >= this.minVotes ? best : "UNKNOWN";
  }

  reset() {
    this.window = [];
  }
}
