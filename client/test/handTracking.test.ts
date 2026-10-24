import { describe, expect, it } from "vitest";
import { DEFAULT_STABILIZER, HandStabilizer } from "../src/gesture/handTracking";
import type { Landmark } from "../src/gesture/types";

const hand = (x: number, y = 0.5): Landmark[] => Array.from({ length: 21 }, (_, i) => ({
  x,
  y: y - (i === 0 ? 0 : 0.1),
  z: 0,
}));

// Keep smoothing negligible when checking which detection was assigned to each track.
const options = { ...DEFAULT_STABILIZER, minCutoff: 1_000_000, beta: 0 };

describe("HandStabilizer", () => {
  it("confirms sustained detections, holds a brief dropout, then expires the hand", () => {
    const tracker = new HandStabilizer(options);
    expect(tracker.update([hand(0.3)], 0)).toHaveLength(0);
    expect(tracker.update([hand(0.3)], 60)).toHaveLength(0);
    expect(tracker.update([hand(0.3)], 120)).toHaveLength(1);
    expect(tracker.update([], 200)).toHaveLength(1);
    expect(tracker.update([], 241)).toHaveLength(0);
  });

  it("requires confirmation again when a hand returns after the hold window without intervening frames", () => {
    const tracker = new HandStabilizer(options);
    tracker.update([hand(0.3)], 0);
    expect(tracker.update([hand(0.3)], 120)).toHaveLength(1);
    expect(tracker.update([hand(0.3)], 300)).toHaveLength(0);
    expect(tracker.update([hand(0.3)], 420)).toHaveLength(1);
  });

  it("keeps two real detections instead of also reporting a held hand after a large movement", () => {
    const tracker = new HandStabilizer({ ...options, confirmMs: 0 });
    tracker.update([hand(0.2), hand(0.5)], 0);
    const hands = tracker.update([hand(0.2), hand(0.9)], 16);
    expect(hands).toHaveLength(2);
    expect(hands.map((points) => points[0].x)).toEqual([0.2, 0.9]);
  });

  it("does not use held ghosts to fill in for two replacement hands awaiting confirmation", () => {
    const tracker = new HandStabilizer(options);
    tracker.update([hand(0.2), hand(0.4)], 0);
    tracker.update([hand(0.2), hand(0.4)], 120);
    expect(tracker.update([hand(0.65), hand(0.9)], 140)).toHaveLength(0);
    expect(tracker.update([hand(0.65), hand(0.9)], 260)).toHaveLength(2);
  });

  it.each([false, true])("preserves both nearby tracks when detection order is reversed: %s", (reversed) => {
    const tracker = new HandStabilizer(options);
    tracker.update([hand(0.3), hand(0.5)], 0);
    tracker.update([hand(0.3), hand(0.5)], 120);
    // 0.39 can match either track; 0.2 can only match the first. Greedy matching
    // consumes the first track too early, leaving its real detection unconfirmed.
    const detections = [hand(0.39), hand(0.2)];
    const hands = tracker.update(reversed ? detections.reverse() : detections, 136);
    expect(hands).toHaveLength(2);
    expect(hands[0][0].x).toBeCloseTo(0.2, 4);
    expect(hands[1][0].x).toBeCloseTo(0.39, 4);
  });

  it("reset clears confirmed hands and their confirmation history", () => {
    const tracker = new HandStabilizer(options);
    tracker.update([hand(0.3)], 0);
    tracker.update([hand(0.3)], 120);
    tracker.reset();
    expect(tracker.update([hand(0.3)], 130)).toHaveLength(0);
  });
});
