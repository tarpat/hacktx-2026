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
  /** Palms-up stance is currently recognised (debug/feedback). */
  palmsUp: boolean;
}

const WRIST = 0;
const INDEX_MCP = 5;
const MIDDLE_MCP = 9;
const PINKY_MCP = 17;

const sortByX = (hands: Landmark[][]) => [...hands].sort((a, b) => a[WRIST].x - b[WRIST].x) as [Landmark[], Landmark[]];

/** Wrist to middle knuckle in 3D (image-height units), so palms-up foreshortening doesn't shrink it. */
function handLength(hand: Landmark[], aspect: number) {
  const a = hand[WRIST];
  const b = hand[MIDDLE_MCP];
  return Math.hypot((a.x - b.x) * aspect, a.y - b.y, (a.z - b.z) * aspect);
}

/** The wrist barely moves when the palm tilts, unlike the knuckles, so wobble doesn't look like bobbing. */
const handHeight = (hand: Landmark[]) => hand[WRIST].y;

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
 * Detects the "six seven" meme: two hands, palms up, alternately bobbing up and down.
 * The bar fills at a rate set by how fast the hands swap; stopping unleashes it.
 * Pure apart from its own state; feed it every frame's hands and a monotonic time.
 */
export class SixSevenDetector {
  private charge = 0;
  private palmUp = 0;
  private stanceUntil = -Infinity;
  /** Furthest relative height reached since the last reversal, and which way it is heading. */
  private extreme: number | null = null;
  private smoothed: number | null = null;
  private direction: 1 | -1 | 0 = 0;
  private swaps: number[] = [];
  private lastSwapAt = -Infinity;
  private lastUpdateAt: number | null = null;

  constructor(private readonly t: SixSevenTimings = DEFAULT_SIX_SEVEN) {}

  update(hands: Landmark[][], now: number, aspect = 4 / 3): SixSevenUpdate {
    const dt = this.lastUpdateAt === null ? 0 : Math.min(100, now - this.lastUpdateAt) / 1000;
    this.lastUpdateAt = now;

    // Losing a hand for a few frames is normal at speed: keep the stance and wait for it to come back.
    if (hands.length === 2) {
      const pair = sortByX(hands);
      this.trackStance(pair, aspect, now);
      // Once charging, keep counting even if the palms tilt mid-bob; the stance only has to start it.
      if (now < this.stanceUntil || this.charge > 0) this.trackMotion(this.offset(pair, aspect), now);
    }
    const stance = now < this.stanceUntil;

    while (this.swaps.length > 0 && now - this.swaps[0] > this.t.speedWindowMs) this.swaps.shift();
    const swapsPerSec = this.swaps.length / (this.t.speedWindowMs / 1000);
    this.charge = Math.min(1, this.charge + dt * this.fillRate(swapsPerSec));

    let castPower: number | null = null;
    if (this.charge > 0 && now - this.lastSwapAt >= this.t.releaseIdleMs) {
      if (this.charge >= this.t.minCastCharge) castPower = this.charge;
      this.resetCharge();
    }
    return { charge: this.charge, swapsPerSec, engaged: stance || this.charge > 0, castPower, palmsUp: stance };
  }

  reset() {
    this.resetCharge();
    this.palmUp = 0;
    this.stanceUntil = -Infinity;
    this.lastUpdateAt = null;
  }

  /** Bar fill per second: nothing when slow, then proportional to how far above the minimum speed you are. */
  private fillRate(swapsPerSec: number) {
    return Math.max(0, swapsPerSec - this.t.minSwapsPerSec) * this.t.fillPerSwapRate;
  }

  private resetCharge() {
    this.charge = 0;
    this.swaps = [];
    this.extreme = null;
    this.smoothed = null;
    this.direction = 0;
    this.lastSwapAt = -Infinity;
  }

  private trackStance(pair: [Landmark[], Landmark[]], aspect: number, now: number) {
    const score = (palmUpScore(pair[0], aspect) + palmUpScore(pair[1], aspect)) / 2;
    this.palmUp += this.t.palmUpSmoothing * (score - this.palmUp);
    if (this.palmUp >= this.t.palmUpThreshold) this.stanceUntil = now + this.t.stanceGraceMs;
  }

  /**
   * Counts a swap each time the hands' relative height turns around by at least `minReversal`.
   * Measuring reversals (not crossings of a fixed line) lets small, fast bobs count wherever the hands are.
   */
  private trackMotion(raw: number | null, now: number) {
    if (raw === null) return;
    this.smoothed = this.smoothed === null ? raw : this.smoothed + this.t.offsetSmoothing * (raw - this.smoothed);
    const offset = this.smoothed;
    if (this.extreme === null) {
      this.extreme = offset;
      return;
    }
    const delta = offset - this.extreme;
    if (this.direction === 0) {
      // The first clear movement sets the direction; it isn't a swap yet.
      if (Math.abs(delta) >= this.t.minReversal) {
        this.direction = delta > 0 ? 1 : -1;
        this.extreme = offset;
      }
      return;
    }
    if (delta * this.direction > 0) {
      this.extreme = offset;
      return;
    }
    if (Math.abs(delta) >= this.t.minReversal && now - this.lastSwapAt >= this.t.minSwapGapMs) {
      this.swaps.push(now);
      this.lastSwapAt = now;
      this.direction = this.direction > 0 ? -1 : 1;
      this.extreme = offset;
    }
  }

  /** Vertical offset between the hands in hand-lengths, so distance from the camera doesn't matter. */
  private offset([left, right]: [Landmark[], Landmark[]], aspect: number) {
    const size = (handLength(left, aspect) + handLength(right, aspect)) / 2;
    if (size === 0) return null;
    // Image y grows downward, so a positive value means the screen-left hand is higher.
    return (handHeight(right) - handHeight(left)) / size;
  }
}
