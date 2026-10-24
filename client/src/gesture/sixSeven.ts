import type { Landmark } from "./types";

export interface SixSevenTimings {
  /** A swap counts once the hands' relative height reverses by this many hand-lengths (small, so fast bobs register). */
  minReversal: number;
  /** Swaps closer together than this are jitter, not hands (people can't swap this fast). */
  minSwapGapMs: number;
  /** Smoothing for the hands' relative height; higher reacts faster but lets more jitter through. */
  offsetSmoothing: number;
  /** Swap speed is measured over this rolling window. */
  speedWindowMs: number;
  /** Below this many swaps per second the bar doesn't fill at all. */
  minSwapsPerSec: number;
  /** Bar fill per second for each swap/s above the minimum, so fast bobbing fills much quicker than slow. */
  fillPerSwapRate: number;
  /** Stop swapping this long to unleash the attack. */
  releaseIdleMs: number;
  /** Charges below this fizzle instead of firing. */
  minCastCharge: number;
  /** How vertical the palm's facing direction must be (0 = facing camera, 1 = facing straight up/down). */
  palmUpThreshold: number;
  /** Smoothing for the palm-up score; higher reacts faster. */
  palmUpSmoothing: number;
  /** Once palms-up is seen, the stance survives blurry or dropped frames for this long. */
  stanceGraceMs: number;
  /** Brief tracking gaps pause charging; longer gaps cancel it without casting. */
  handLossGraceMs: number;
}

export const DEFAULT_SIX_SEVEN: SixSevenTimings = {
  minReversal: 0.13,
  minSwapGapMs: 90,
  offsetSmoothing: 0.65,
  speedWindowMs: 1_200,
  minSwapsPerSec: 0.8,
  fillPerSwapRate: 0.13,
  releaseIdleMs: 800,
  minCastCharge: 0.2,
  palmUpThreshold: 0.22,
  palmUpSmoothing: 0.5,
  stanceGraceMs: 1_200,
  handLossGraceMs: 300,
};

export interface SixSevenUpdate {
  /** 0–1 charge bar. */
  charge: number;
  /** Current bobbing speed in swaps per second. */
  swapsPerSec: number;
  /** True while the 6-7 stance/motion is active; other gestures should be ignored. */
  engaged: boolean;
  /** Set on the frame the attack is unleashed, with its power (0–1). */
  castPower: number | null;
  /** Six Seven stance is recognised from palm orientation or repeated alternating motion. */
  palmsUp: boolean;
}

const WRIST = 0;
const INDEX_MCP = 5;
const MIDDLE_MCP = 9;
const PINKY_MCP = 17;
const PALM_POINTS = [WRIST, INDEX_MCP, MIDDLE_MCP, 13, PINKY_MCP];
const FINGERS = [[6, 8], [10, 12], [14, 16], [18, 20]];
type Heights = [number, number];

const sortByX = (hands: Landmark[][]) => [...hands].sort((a, b) => a[WRIST].x - b[WRIST].x) as [Landmark[], Landmark[]];

/** Wrist to middle knuckle in 3D (image-height units), so palms-up foreshortening doesn't shrink it. */
function handLength(hand: Landmark[], aspect: number) {
  const a = hand[WRIST];
  const b = hand[MIDDLE_MCP];
  return Math.hypot((a.x - b.x) * aspect, a.y - b.y, (a.z - b.z) * aspect);
}

/** Includes palm bobs made by tilting at the wrist, as well as whole-arm movement. */
const handHeight = (hand: Landmark[]) => PALM_POINTS.reduce((sum, i) => sum + hand[i].y, 0) / PALM_POINTS.length;

/** Relaxed fingers qualify too; a strict OPEN_PALM pose misses slightly cupped hands. */
function isOpenHand(hand: Landmark[], aspect: number): boolean {
  if (hand.length < 21 || hand.some((p) => !Number.isFinite(p.x + p.y + p.z))) return false;
  const wrist = hand[WRIST];
  const distance = (p: Landmark) => Math.hypot((p.x - wrist.x) * aspect, p.y - wrist.y, (p.z - wrist.z) * aspect);
  return FINGERS.filter(([pip, tip]) => distance(hand[tip]) > distance(hand[pip]) * 1.05).length >= 3;
}

/** Keep the configured 30 fps response while making smoothing consistent across cameras. */
const smoothing = (amount: number, dt: number) => 1 - Math.pow(1 - amount, dt * 30);

/**
 * How much the palm faces up or down rather than toward the camera, 0–1.
 * The palm's facing direction is the normal of the wrist/index/pinky knuckle plane.
 * Up and down aren't distinguished: that needs reliable handedness, and palms-down 6-7 is harmless.
 * `aspect` (width / height) puts x, y and z on the same scale; MediaPipe's z is roughly in x units.
 */
export function palmUpScore(hand: Landmark[], aspect: number): number {
  const w = hand[WRIST];
  const toPoint = (p: Landmark) => ({ x: (p.x - w.x) * aspect, y: p.y - w.y, z: (p.z - w.z) * aspect });
  const a = toPoint(hand[INDEX_MCP]);
  const b = toPoint(hand[PINKY_MCP]);
  const n = { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
  const length = Math.hypot(n.x, n.y, n.z);
  return length === 0 ? 0 : Math.abs(n.y) / length;
}

/**
 * Ensures the hand is oriented correctly for the 6-7 gesture:
 * 1. The arm/wrist enters from below (wrist.y >= middle_mcp.y - 0.05).
 * 2. The palm faces upward (verified either by 3D vertical normal or 2D foreshortening
 *    when camera depth is flat/noisy, distinguishing it from camera-facing palms like Shield).
 */
export function isOrientedForSixSeven(hand: Landmark[], aspect: number, threshold = DEFAULT_SIX_SEVEN.palmUpThreshold): boolean {
  if (hand.length < 21) return false;
  const w = hand[WRIST];
  const mm = hand[MIDDLE_MCP];
  // Arm/wrist must support the hand from below (image y increases downward).
  if (w.y < mm.y - 0.05) return false;

  // 3D vertical palm normal:
  if (palmUpScore(hand, aspect) >= threshold) return true;

  // 2D check for flat camera depth: edge-on palms have knuckles spread horizontally and compressed vertical height.
  const im = hand[INDEX_MCP];
  const pm = hand[PINKY_MCP];
  const knuckleSpanX = Math.abs(im.x - pm.x) * aspect;
  const knuckleSpanY = Math.abs(im.y - pm.y);
  const wristToKnuckleY = Math.abs(w.y - mm.y);

  return knuckleSpanX > 0.04 && knuckleSpanY < knuckleSpanX * 0.8 && wristToKnuckleY < knuckleSpanX * 0.85;
}

/**
 * Detects the "six seven" meme: two hands, palms up, alternately bobbing up and down.
 * The bar fills at a rate set by how fast the hands swap; stopping unleashes it.
 * Pure apart from its own state; feed it every frame's hands and a monotonic time.
 */
export class SixSevenDetector {
  private charge = 0;
  private palmUp = 0;
  private stanceUntil = -Infinity;
  /** Palm positions at the last relative-height extreme; compare displacement, not absolute height/size. */
  private extreme: Heights | null = null;
  private smoothed: Heights | null = null;
  private segmentSize = 0;
  private direction: 1 | -1 | 0 = 0;
  private swaps: number[] = [];
  private lastSwapAt = -Infinity;
  private lastMotionAt = -Infinity;
  private lastUpdateAt: number | null = null;
  private lastPairAt = -Infinity;

  constructor(private readonly t: SixSevenTimings = DEFAULT_SIX_SEVEN) {}

  update(hands: Landmark[][], now: number, aspect = 4 / 3): SixSevenUpdate {
    const dt = this.lastUpdateAt === null ? 0 : Math.max(0, Math.min(100, now - this.lastUpdateAt)) / 1000;
    this.lastUpdateAt = now;

    // Expire before processing a returning pair so a long gap cannot resume an old charge.
    if (now - this.lastPairAt > this.t.handLossGraceMs) {
      this.resetCharge();
      this.palmUp = 0;
      this.stanceUntil = -Infinity;
    }
    const pairVisible = hands.length === 2 && hands.every((hand) => isOpenHand(hand, aspect));
    const pair = pairVisible ? sortByX(hands) : null;
    const bothOriented = pair !== null && pair.every((hand) => isOrientedForSixSeven(hand, aspect, this.t.palmUpThreshold));

    if (pairVisible && pair) {
      this.lastPairAt = now;
      this.trackStance(pair, aspect, now, dt || 1 / 30, bothOriented);
      const size = (handLength(pair[0], aspect) + handLength(pair[1], aspect)) / 2;
      this.trackMotion([handHeight(pair[0]), handHeight(pair[1])], size, now, dt || 1 / 30);
    } else {
      // Reacquisition starts a fresh segment: the jump across a missing frame is not a bob.
      this.resetMotion();
    }

    while (this.swaps.length > 0 && now - this.swaps[0] > this.t.speedWindowMs) this.swaps.shift();
    // Depth is least reliable for edge-on palms. Two opposed reversals with correctly oriented hands
    // maintain the stance even when depth normal is noisy.
    if (pairVisible && bothOriented && this.swaps.length >= 2 && now - this.lastSwapAt < this.t.releaseIdleMs) {
      this.stanceUntil = now + this.t.stanceGraceMs;
    }
    const stance = now < this.stanceUntil;
    let swapsPerSec = this.swaps.length / (this.t.speedWindowMs / 1000);
    if (pairVisible && stance) this.charge = Math.min(1, this.charge + dt * this.fillRate(swapsPerSec));

    let castPower: number | null = null;
    if (pairVisible && this.charge > 0 && now - this.lastMotionAt >= this.t.releaseIdleMs) {
      if (this.charge >= this.t.minCastCharge) castPower = this.charge;
      this.resetCharge();
      swapsPerSec = 0;
    }
    return { charge: this.charge, swapsPerSec, engaged: stance || this.charge > 0, castPower, palmsUp: stance };
  }

  reset() {
    this.resetCharge();
    this.palmUp = 0;
    this.stanceUntil = -Infinity;
    this.lastUpdateAt = null;
    this.lastPairAt = -Infinity;
  }

  /** Bar fill per second: nothing when slow, then proportional to how far above the minimum speed you are. */
  private fillRate(swapsPerSec: number) {
    return Math.max(0, swapsPerSec - this.t.minSwapsPerSec) * this.t.fillPerSwapRate;
  }

  private resetCharge() {
    this.charge = 0;
    this.swaps = [];
    this.resetMotion();
    this.lastSwapAt = -Infinity;
    this.lastMotionAt = -Infinity;
  }

  private resetMotion() {
    this.extreme = null;
    this.smoothed = null;
    this.direction = 0;
    this.segmentSize = 0;
  }

  private trackStance(pair: [Landmark[], Landmark[]], aspect: number, now: number, dt: number, bothOriented: boolean) {
    if (!bothOriented) {
      this.palmUp += smoothing(this.t.palmUpSmoothing, dt) * (0 - this.palmUp);
      return;
    }
    const score3D = Math.min(palmUpScore(pair[0], aspect), palmUpScore(pair[1], aspect));
    const score = Math.max(score3D, this.t.palmUpThreshold);
    this.palmUp += smoothing(this.t.palmUpSmoothing, dt) * (score - this.palmUp);
    if (this.palmUp >= this.t.palmUpThreshold) this.stanceUntil = now + this.t.stanceGraceMs;
  }

  /**
   * Counts a swap each time the hands' relative height turns around by at least `minReversal`.
   * Measuring reversals (not crossings of a fixed line) lets small, fast bobs count wherever the hands are.
   */
  private trackMotion(raw: Heights, size: number, now: number, dt: number) {
    if (size <= 0) return;
    const alpha = smoothing(this.t.offsetSmoothing, dt);
    this.smoothed = this.smoothed === null ? raw : [
      this.smoothed[0] + alpha * (raw[0] - this.smoothed[0]),
      this.smoothed[1] + alpha * (raw[1] - this.smoothed[1]),
    ];
    const current = this.smoothed;
    if (this.extreme === null) {
      this.extreme = current;
      this.segmentSize = size;
      // After a brief gap, establish visible stillness again before allowing a release.
      this.lastMotionAt = now;
      return;
    }
    const left = (current[0] - this.extreme[0]) / this.segmentSize;
    const right = (current[1] - this.extreme[1]) / this.segmentSize;
    const delta = right - left;
    // Evaluate the whole half-cycle, allowing either hand to pause between frames.
    const opposed = left * right < 0 && Math.min(Math.abs(left), Math.abs(right)) >= this.t.minReversal * 0.2;
    if (this.direction === 0) {
      // The first clear movement sets the direction; it isn't a swap yet.
      if (opposed && Math.abs(delta) >= this.t.minReversal) {
        this.direction = delta > 0 ? 1 : -1;
        this.extreme = current;
        this.segmentSize = size;
        this.lastMotionAt = now;
      }
      return;
    }
    if (delta * this.direction > 0) {
      if (opposed) this.lastMotionAt = now;
      this.extreme = current;
      this.segmentSize = size;
      return;
    }
    if (opposed && Math.abs(delta) >= this.t.minReversal && now - this.lastSwapAt >= this.t.minSwapGapMs) {
      this.swaps.push(now);
      this.lastSwapAt = now;
      this.lastMotionAt = now;
      this.direction = this.direction > 0 ? -1 : 1;
      this.extreme = current;
      this.segmentSize = size;
    }
  }
}
