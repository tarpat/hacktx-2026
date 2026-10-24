import type { Landmark } from "./types";
import type { SixSevenUpdate } from "./sixSeven";

/**
 * Six Seven from the body pose (shoulders, elbows, wrists) instead of the hand skeleton.
 *
 * Hand landmarks blur and drop out while hands bob quickly, and palms facing the ceiling are
 * edge-on to the camera, which is the worst case for the hand model. Forearms stay visible
 * and are tracked well by the pose model, so this detector reads the motion from the arms
 * and only uses hand landmarks (when available) to veto a clearly wrong hand orientation.
 *
 * Distances are in shoulder widths, so camera distance doesn't matter.
 */
export interface ArmSixSevenOptions {
  /** Pose landmarks below this visibility (0–1) are treated as not seen. */
  minVisibility: number;
  /** A swap counts once the wrists' relative height reverses by this many shoulder widths. */
  minReversal: number;
  /** Each wrist must move at least this share of the reversal, in opposite directions. */
  minOpposedShare: number;
  /** Swaps closer together than this are jitter. */
  minSwapGapMs: number;
  /** Smoothing for wrist heights at 30 fps; higher reacts faster. */
  smoothing: number;
  speedWindowMs: number;
  /** Below this many swaps per second the bar doesn't fill. */
  minSwapsPerSec: number;
  fillPerSwapRate: number;
  /** Wrists must stay within this many shoulder widths for `releaseIdleMs` to count as a stop. */
  stillTolerance: number;
  releaseIdleMs: number;
  minCastCharge: number;
  /** Brief stance or tracking loss pauses charging; longer cancels it without casting. */
  stanceLossGraceMs: number;
  /** Forearm must be raised: wrist no more than this far below the elbow (arms hanging down fail). */
  maxWristBelowElbow: number;
  /** Hands stay low: wrist no more than this far above the shoulder. */
  maxWristAboveShoulder: number;
  /** Elbows stay down by the body: elbow at least this far below the shoulder. */
  minElbowBelowShoulder: number;
  /** Fingers pointing straight up (palm to the camera, e.g. shield) by more than this veto the stance. */
  maxFingersUp: number;
}

export const DEFAULT_ARM_SIX_SEVEN: ArmSixSevenOptions = {
  minVisibility: 0.5,
  minReversal: 0.2,
  minOpposedShare: 0.2,
  minSwapGapMs: 110,
  smoothing: 0.55,
  speedWindowMs: 1_200,
  minSwapsPerSec: 0.8,
  fillPerSwapRate: 0.13,
  stillTolerance: 0.1,
  releaseIdleMs: 700,
  minCastCharge: 0.2,
  stanceLossGraceMs: 400,
  maxWristBelowElbow: 0.5,
  maxWristAboveShoulder: 0.4,
  minElbowBelowShoulder: 0.15,
  maxFingersUp: 0.4,
};

export type PoseLandmark = Landmark & { visibility?: number };

/** Why the stance is (not) recognised; shown on the gesture test page for tuning. */
export type ArmStanceStatus = "NO_POSE" | "ARMS_NOT_VISIBLE" | "ARMS_DOWN" | "HANDS_TOO_HIGH" | "PALMS_FACING_CAMERA" | "READY";

export interface ArmSixSevenUpdate extends SixSevenUpdate {
  status: ArmStanceStatus;
}

// MediaPipe pose landmark indices.
const ARMS = [
  { shoulder: 11, elbow: 13, wrist: 15 },
  { shoulder: 12, elbow: 14, wrist: 16 },
] as const;
const HAND_WRIST = 0;
const HAND_MIDDLE_TIP = 12;
const HAND_MATCH_DISTANCE = 0.12;

type Pair = [number, number];

const smoothingFor = (amount: number, dt: number) => 1 - Math.pow(1 - amount, dt * 30);

interface Stance {
  status: ArmStanceStatus;
  /** Wrist heights below the shoulder line, in shoulder widths (image y grows downward). */
  heights: Pair | null;
}

/** Checks both arms are in the 6-7 position: elbows down, forearms raised in front, palms not facing the camera. */
export function armStance(
  pose: PoseLandmark[] | null | undefined,
  hands: Landmark[][],
  aspect: number,
  o: ArmSixSevenOptions = DEFAULT_ARM_SIX_SEVEN,
): Stance {
  if (!pose || pose.length < 17) return { status: "NO_POSE", heights: null };
  const visible = (i: number) => (pose[i].visibility ?? 1) >= o.minVisibility
    && pose[i].x >= 0 && pose[i].x <= 1 && pose[i].y >= 0 && pose[i].y <= 1;
  if (!ARMS.every((arm) => visible(arm.shoulder) && visible(arm.elbow) && visible(arm.wrist))) {
    return { status: "ARMS_NOT_VISIBLE", heights: null };
  }
  const [l, r] = [pose[11], pose[12]];
  const sw = Math.hypot((l.x - r.x) * aspect, l.y - r.y);
  if (sw < 0.05) return { status: "ARMS_NOT_VISIBLE", heights: null };
  const shoulderY = (l.y + r.y) / 2;

  for (const arm of ARMS) {
    const s = pose[arm.shoulder];
    const e = pose[arm.elbow];
    const w = pose[arm.wrist];
    if ((e.y - s.y) / sw < o.minElbowBelowShoulder) return { status: "HANDS_TOO_HIGH", heights: null };
    if ((s.y - w.y) / sw > o.maxWristAboveShoulder) return { status: "HANDS_TOO_HIGH", heights: null };
    if ((w.y - e.y) / sw > o.maxWristBelowElbow) return { status: "ARMS_DOWN", heights: null };
  }

  // Hand landmarks are optional (they drop out at speed), but when a hand is seen
  // with its fingers pointing up, the palm faces the camera: that's shield, not 6-7.
  for (const arm of ARMS) {
    const w = pose[arm.wrist];
    const hand = nearestHand(hands, w);
    if (hand && (hand[HAND_WRIST].y - hand[HAND_MIDDLE_TIP].y) / sw > o.maxFingersUp) {
      return { status: "PALMS_FACING_CAMERA", heights: null };
    }
  }

  return {
    status: "READY",
    heights: [(pose[ARMS[0].wrist].y - shoulderY) / sw, (pose[ARMS[1].wrist].y - shoulderY) / sw],
  };
}

function nearestHand(hands: Landmark[][], wrist: Landmark): Landmark[] | null {
  let best: Landmark[] | null = null;
  let bestDistance = HAND_MATCH_DISTANCE;
  for (const hand of hands) {
    if (hand.length < 21) continue;
    const d = Math.hypot(hand[HAND_WRIST].x - wrist.x, hand[HAND_WRIST].y - wrist.y);
    if (d < bestDistance) [best, bestDistance] = [hand, d];
  }
  return best;
}

/**
 * Counts swaps (reversals of the wrists' relative height with the wrists moving in opposite
 * directions), fills the bar by swap speed, and fires once the arms hold still in the stance.
 */
export class ArmSixSevenDetector {
  private charge = 0;
  private smoothed: Pair | null = null;
  private extreme: Pair | null = null;
  private direction: 1 | -1 | 0 = 0;
  private swaps: number[] = [];
  private lastSwapAt = -Infinity;
  private stillAnchor: Pair | null = null;
  private lastMotionAt = -Infinity;
  private lastStanceAt = -Infinity;
  private lastUpdateAt: number | null = null;

  constructor(private readonly o: ArmSixSevenOptions = DEFAULT_ARM_SIX_SEVEN) {}

  update(pose: PoseLandmark[] | null | undefined, hands: Landmark[][], now: number, aspect = 4 / 3): ArmSixSevenUpdate {
    const dt = this.lastUpdateAt === null ? 1 / 30 : Math.max(0, Math.min(100, now - this.lastUpdateAt)) / 1000;
    this.lastUpdateAt = now;

    if (now - this.lastStanceAt > this.o.stanceLossGraceMs) this.resetCharge();
    const stance = armStance(pose, hands, aspect, this.o);
    if (stance.heights) {
      this.lastStanceAt = now;
      this.track(stance.heights, now, dt);
    } else {
      // Re-entering the stance starts a fresh segment: the jump back in is not a bob.
      this.resetMotion();
    }

    while (this.swaps.length > 0 && now - this.swaps[0] > this.o.speedWindowMs) this.swaps.shift();
    let swapsPerSec = this.swaps.length / (this.o.speedWindowMs / 1000);
    if (stance.heights) this.charge = Math.min(1, this.charge + dt * Math.max(0, swapsPerSec - this.o.minSwapsPerSec) * this.o.fillPerSwapRate);

    let castPower: number | null = null;
    if (stance.heights && this.charge > 0 && now - this.lastMotionAt >= this.o.releaseIdleMs) {
      if (this.charge >= this.o.minCastCharge) castPower = this.charge;
      this.resetCharge();
      swapsPerSec = 0;
    }

    // Only claim the hands once they are actually bobbing; a still arm stance is shared with other spells.
    const engaged = this.charge > 0 || this.swaps.length > 0;
    return { charge: this.charge, swapsPerSec, engaged, castPower, palmsUp: stance.status === "READY", status: stance.status };
  }

  reset() {
    this.resetCharge();
    this.lastStanceAt = -Infinity;
    this.lastUpdateAt = null;
  }

  private resetCharge() {
    this.charge = 0;
    this.swaps = [];
    this.lastSwapAt = -Infinity;
    this.lastMotionAt = -Infinity;
    this.resetMotion();
  }

  private resetMotion() {
    this.smoothed = null;
    this.extreme = null;
    this.direction = 0;
    this.stillAnchor = null;
  }

  private track(raw: Pair, now: number, dt: number) {
    const alpha = smoothingFor(this.o.smoothing, dt);
    const current: Pair = this.smoothed === null ? raw : [
      this.smoothed[0] + alpha * (raw[0] - this.smoothed[0]),
      this.smoothed[1] + alpha * (raw[1] - this.smoothed[1]),
    ];
    this.smoothed = current;

    // Stillness: any wrist leaving a small box around the anchor counts as motion.
    if (this.stillAnchor === null) {
      this.stillAnchor = current;
      // After (re)acquiring, stillness has to be seen again before a release.
      this.lastMotionAt = now;
    } else if (Math.max(Math.abs(current[0] - this.stillAnchor[0]), Math.abs(current[1] - this.stillAnchor[1])) > this.o.stillTolerance) {
      this.stillAnchor = current;
      this.lastMotionAt = now;
    }

    if (this.extreme === null) {
      this.extreme = current;
      return;
    }
    const a = current[0] - this.extreme[0];
    const b = current[1] - this.extreme[1];
    const delta = b - a;
    const opposed = a * b < 0 && Math.min(Math.abs(a), Math.abs(b)) >= this.o.minReversal * this.o.minOpposedShare;

    if (this.direction === 0) {
      if (opposed && Math.abs(delta) >= this.o.minReversal) {
        this.direction = delta > 0 ? 1 : -1;
        this.extreme = current;
      }
      return;
    }
    // Still heading the same way: extend the segment.
    if (delta * this.direction > 0) {
      this.extreme = current;
      return;
    }
    if (opposed && Math.abs(delta) >= this.o.minReversal && now - this.lastSwapAt >= this.o.minSwapGapMs) {
      this.swaps.push(now);
      this.lastSwapAt = now;
      this.direction = this.direction > 0 ? -1 : 1;
      this.extreme = current;
    }
  }
}
