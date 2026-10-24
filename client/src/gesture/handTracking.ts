import type { Landmark } from "./types";

/**
 * Ghost hands are mostly removed by the landmarker's presence confidence (see GestureController).
 * These checks catch what's left: hands half out of frame and implausibly tiny detections.
 * Handedness scores are deliberately unused: they rate left-vs-right, and real palms-up hands score low.
 */
export interface HandFilterOptions {
  /** Drop hands with more than this share of landmarks outside the frame: those points are guesses. */
  maxOffscreenShare: number;
  /** Drop implausibly small hands (wrist to middle knuckle, image-height units): usually distant ghosts. */
  minHandLength: number;
}

export interface StabilizerOptions {
  /** A new hand must be seen this long before it counts, so one-off ghosts never reach the classifier. */
  confirmMs: number;
  /** A confirmed hand survives this long without detections, so a blurred frame doesn't drop it. */
  holdMs: number;
  /** Detections within this wrist distance (image units) are the same hand as last frame. */
  matchDistance: number;
  /** One Euro filter: jitter smoothing at rest (Hz; lower = smoother). */
  minCutoff: number;
  /** One Euro filter: how quickly smoothing relaxes as the hand moves fast, so motion isn't lagged. */
  beta: number;
}

export const DEFAULT_HAND_FILTER: HandFilterOptions = { maxOffscreenShare: 0.2, minHandLength: 0.03 };

export const DEFAULT_STABILIZER: StabilizerOptions = { confirmMs: 120, holdMs: 120, matchDistance: 0.15, minCutoff: 1.5, beta: 8 };

const WRIST = 0;
const MIDDLE_MCP = 9;
const EDGE_MARGIN = 0.02;

/** Removes detections that are probably not real, fully visible hands. */
export function filterHands(hands: Landmark[][], o: HandFilterOptions = DEFAULT_HAND_FILTER): Landmark[][] {
  return hands.filter((landmarks) => {
    if (landmarks.length < 21) return false;
    const offscreen = landmarks.filter((p) => p.x < -EDGE_MARGIN || p.x > 1 + EDGE_MARGIN || p.y < -EDGE_MARGIN || p.y > 1 + EDGE_MARGIN);
    if (offscreen.length / landmarks.length > o.maxOffscreenShare) return false;
    const w = landmarks[WRIST];
    const m = landmarks[MIDDLE_MCP];
    return Math.hypot(w.x - m.x, w.y - m.y, w.z - m.z) >= o.minHandLength;
  });
}

/** One Euro filter for a single value: smooths jitter when still, follows quickly when moving. */
class OneEuro {
  private value: number | null = null;
  private velocity = 0;

  constructor(private readonly minCutoff: number, private readonly beta: number) {}

  next(x: number, dtSec: number): number {
    if (this.value === null || dtSec <= 0) {
      this.value = x;
      return x;
    }
    const alpha = (cutoff: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dtSec));
    const rawVelocity = (x - this.value) / dtSec;
    this.velocity += alpha(1) * (rawVelocity - this.velocity);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.velocity);
    this.value += alpha(cutoff) * (x - this.value);
    return this.value;
  }
}

interface Track {
  firstSeenAt: number;
  lastSeenAt: number;
  /** Set once the hand has actually been seen for `confirmMs`; held frames don't count toward it. */
  confirmed: boolean;
  landmarks: Landmark[];
  filters: OneEuro[];
}

/**
 * Tracks hands across frames: confirms new hands before reporting them, holds hands
 * through brief dropouts, and smooths landmark jitter. This is what stops phantom
 * hands and single-frame glitches from becoming casts.
 */
export class HandStabilizer {
  private tracks: Track[] = [];
  private lastAt: number | null = null;

  constructor(private readonly o: StabilizerOptions = DEFAULT_STABILIZER) {}

  update(hands: Landmark[][], now: number): Landmark[][] {
    const dtSec = this.lastAt === null ? 0 : (now - this.lastAt) / 1000;
    this.lastAt = now;

    // Greedy nearest-wrist matching; with at most two hands this is exact enough.
    const unmatched = new Set(this.tracks);
    for (const hand of hands) {
      let best: Track | null = null;
      let bestDistance = this.o.matchDistance;
      for (const track of unmatched) {
        const distance = Math.hypot(hand[WRIST].x - track.landmarks[WRIST].x, hand[WRIST].y - track.landmarks[WRIST].y);
        if (distance < bestDistance) [best, bestDistance] = [track, distance];
      }
      if (best) {
        unmatched.delete(best);
        best.lastSeenAt = now;
        best.confirmed ||= now - best.firstSeenAt >= this.o.confirmMs;
        best.landmarks = this.smooth(best, hand, dtSec);
      } else {
        const track: Track = { firstSeenAt: now, lastSeenAt: now, confirmed: this.o.confirmMs <= 0, landmarks: hand, filters: [] };
        track.landmarks = this.smooth(track, hand, 0);
        this.tracks.push(track);
      }
    }

    this.tracks = this.tracks.filter((track) => now - track.lastSeenAt <= this.o.holdMs);
    return this.tracks.filter((track) => track.confirmed).map((track) => track.landmarks);
  }

  reset() {
    this.tracks = [];
    this.lastAt = null;
  }

  private smooth(track: Track, hand: Landmark[], dtSec: number): Landmark[] {
    return hand.map((point, i) => {
      const base = i * 3;
      for (let axis = 0; axis < 3; axis++) track.filters[base + axis] ??= new OneEuro(this.o.minCutoff, this.o.beta);
      return {
        x: track.filters[base].next(point.x, dtSec),
        y: track.filters[base + 1].next(point.y, dtSec),
        z: track.filters[base + 2].next(point.z, dtSec),
      };
    });
  }
}
