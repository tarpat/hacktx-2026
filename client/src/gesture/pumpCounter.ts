import type { HandPose } from "./types";

type HandShape = "closed" | "open";

const shapeOf = (pose: HandPose): HandShape | null =>
  pose === "FIST" || pose === "BOTH_FISTS" ? "closed" : pose === "OPEN_PALM" || pose === "BOTH_PALMS" ? "open" : null;

/**
 * Counts fist pumps for the spell-struggle tug-of-war: every open↔closed flip is one push,
 * so pumping faster pushes harder. Uses raw per-frame poses (the normal 5-of-7 vote would cap
 * the pump rate), with a short confirmation so one misread frame can't count as a flip.
 */
export class PumpCounter {
  private shape: HandShape | null = null;
  private candidate: HandShape | null = null;
  private candidateFrames = 0;

  constructor(private readonly confirmFrames = 2) {}

  /** Returns true on the frame a flip is confirmed. */
  update(rawPose: HandPose): boolean {
    const next = shapeOf(rawPose);
    if (next === null || next === this.shape) {
      this.candidate = null;
      this.candidateFrames = 0;
      return false;
    }
    if (next !== this.candidate) {
      this.candidate = next;
      this.candidateFrames = 0;
    }
    if (++this.candidateFrames < this.confirmFrames) return false;
    const flipped = this.shape !== null;
    this.shape = next;
    this.candidate = null;
    this.candidateFrames = 0;
    // The first shape seen just sets the baseline; it isn't a push.
    return flipped;
  }

  reset() {
    this.shape = null;
    this.candidate = null;
    this.candidateFrames = 0;
  }
}
