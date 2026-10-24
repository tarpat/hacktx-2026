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
  return "UNKNOWN";
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
