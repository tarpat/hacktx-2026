import { describe, expect, it } from "vitest";
import { SixSevenDetector, palmUpScore } from "../src/gesture/sixSeven";
import { filterHands, HandStabilizer } from "../src/gesture/handTracking";
import type { SixSevenUpdate } from "../src/gesture/sixSeven";
import type { Landmark } from "../src/gesture/types";

const ASPECT = 4 / 3;

// Local coordinates are image-height units. Start with an open, camera-facing
// hand, then rotate it around its wrist to simulate a palm facing upward.
const OPEN_HAND: readonly (readonly [number, number, number])[] = [
  [0, 0, 0],
  [-0.035, -0.025, 0], [-0.060, -0.045, 0], [-0.080, -0.060, 0], [-0.095, -0.075, 0],
  [-0.035, -0.085, 0], [-0.040, -0.140, 0], [-0.040, -0.175, 0], [-0.040, -0.205, 0],
  [0, -0.100, 0], [0, -0.160, 0], [0, -0.195, 0], [0, -0.225, 0],
  [0.030, -0.090, 0], [0.035, -0.145, 0], [0.035, -0.180, 0], [0.035, -0.205, 0],
  [0.055, -0.070, 0], [0.065, -0.110, 0], [0.065, -0.135, 0], [0.065, -0.160, 0],
];

interface HandOptions {
  aspect?: number;
  angle?: number;
  scale?: number;
  flatDepth?: boolean;
  depthNoise?: number;
  pose?: "open" | "relaxed" | "fist";
}

function hand(x: number, y: number, options: HandOptions = {}): Landmark[] {
  const { aspect = ASPECT, angle = 60, scale = 1, flatDepth = false, depthNoise = 0, pose = "open" } = options;
  const radians = angle * Math.PI / 180;
  const points = OPEN_HAND.map(([px, py, pz]) => [px, py, pz]);
  for (const mcp of [5, 9, 13, 17]) {
    if (pose === "fist") {
      points[mcp + 1][1] = points[mcp][1] - 0.025;
      points[mcp + 2][1] = points[mcp][1] - 0.010;
      points[mcp + 3][1] = points[mcp][1] + 0.015;
    } else if (pose === "relaxed") {
      // Three extended fingers plus a partly curled pinky are a relaxed hand,
      // not the exact OPEN_PALM pose required by other spells.
      points[mcp + 3][1] = points[mcp + 1][1] * (mcp === 17 ? 1.05 : 1.22);
    }
  }
  return points.map(([px, py, pz], index) => ({
    x: x + px * scale / aspect,
    y: y + (py * Math.cos(radians) - pz * Math.sin(radians)) * scale,
    z: flatDepth ? 0 : (py * Math.sin(radians) + pz * Math.cos(radians)) * scale / aspect
      + (index === 0 ? 0 : depthNoise * Math.sin(index * 2.7)),
  }));
}

function opposing(timeMs: number, hz = 1.6, options: HandOptions = {}): Landmark[][] {
  const bob = 0.025 * (options.scale ?? 1) * Math.sin(timeMs / 1000 * 2 * Math.PI * hz);
  return [hand(0.3, 0.6 + bob, options), hand(0.7, 0.6 - bob, options)];
}

function replay(
  detector: SixSevenDetector,
  fromMs: number,
  toMs: number,
  handsAt: (timeMs: number, frame: number) => Landmark[][],
  fps = 30,
  aspect = ASPECT,
): SixSevenUpdate[] {
  const frames: SixSevenUpdate[] = [];
  const count = Math.round((toMs - fromMs) / 1000 * fps);
  for (let frame = 0; frame <= count; frame++) {
    const time = fromMs + (toMs - fromMs) * frame / count;
    frames.push(detector.update(handsAt(time, frame), time, aspect));
  }
  return frames;
}

const peakCharge = (frames: SixSevenUpdate[]) => Math.max(...frames.map((frame) => frame.charge));
const casts = (frames: SixSevenUpdate[]) => frames.flatMap((frame) => frame.castPower === null ? [] : [frame.castPower]);

describe("SixSevenDetector camera motion", () => {
  it("charges opposing open palms and fires exactly once after a visible stop", () => {
    const detector = new SixSevenDetector();
    const moving = replay(detector, 0, 3200, (time) => opposing(time));
    expect(peakCharge(moving)).toBeGreaterThan(0.2);
    expect(casts(moving)).toEqual([]);
    const stopped = replay(detector, 3200, 5500, () => opposing(3200));
    expect(casts(stopped)).toHaveLength(1);
    expect(casts(stopped)[0]).toBeGreaterThanOrEqual(0.2);
    expect(stopped.at(-1)?.charge).toBe(0);
  });

  it("builds more charge when hands bob faster", () => {
    const slow = replay(new SixSevenDetector(), 0, 2400, (time) => opposing(time, 0.9));
    const fast = replay(new SixSevenDetector(), 0, 2400, (time) => opposing(time, 2.0));
    expect(peakCharge(fast)).toBeGreaterThan(peakCharge(slow) + 0.15);
  });

  it("recognizes the same motion at 15, 30, and 60 camera frames per second", () => {
    const charges = [15, 30, 60].map((fps) => {
      const frames = replay(new SixSevenDetector(), 0, 2200, (time) => opposing(time), fps);
      expect(casts(frames)).toEqual([]);
      return frames.at(-1)!.charge;
    });
    expect(Math.min(...charges)).toBeGreaterThan(0.2);
    expect(Math.max(...charges) - Math.min(...charges)).toBeLessThan(0.12);
  });

  it.each(["open", "relaxed"] as const)("uses repeated opposing %s hands when camera depth is flat", (pose) => {
    const options = { flatDepth: true, pose };
    expect(palmUpScore(hand(0.3, 0.6, options), ASPECT)).toBe(0);
    const frames = replay(new SixSevenDetector(), 0, 3600, (time) => opposing(time, 1.6, options));
    expect(peakCharge(frames)).toBeGreaterThan(0.2);
    expect(casts(frames)).toEqual([]);
  });

  it("keeps recognizing open hands with noisy palm depth", () => {
    const frames = replay(new SixSevenDetector(), 0, 3200, (time, frame) => opposing(time, 1.6, {
      depthNoise: 0.008 * Math.sin(frame * 1.7),
    }));
    expect(peakCharge(frames)).toBeGreaterThan(0.2);
    expect(casts(frames)).toEqual([]);
  });

  it("recognizes opposite palm bobs while wrists remain fixed", () => {
    const frames = replay(new SixSevenDetector(), 0, 3600, (time) => {
      const tilt = 25 * Math.sin(time / 1000 * 2 * Math.PI * 1.6);
      return [hand(0.3, 0.6, { angle: 55 + tilt }), hand(0.7, 0.6, { angle: 55 - tilt })];
    });
    expect(peakCharge(frames)).toBeGreaterThan(0.2);
  });

  it("does not count a single moving hand next to a stationary hand", () => {
    const frames = replay(new SixSevenDetector(), 0, 4000, (time) => [
      opposing(time)[0], hand(0.7, 0.6),
    ]);
    expect(peakCharge(frames)).toBe(0);
    expect(casts(frames)).toEqual([]);
  });

  it("does not count both hands moving together", () => {
    const frames = replay(new SixSevenDetector(), 0, 4000, (time) => {
      const bob = 0.025 * Math.sin(time / 1000 * 2 * Math.PI * 1.6);
      return [hand(0.3, 0.6 + bob), hand(0.7, 0.6 + bob)];
    });
    expect(peakCharge(frames)).toBe(0);
    expect(casts(frames)).toEqual([]);
  });

  it("does not count small landmark jitter", () => {
    const frames = replay(new SixSevenDetector(), 0, 4000, (_time, frame) => [
      hand(0.3, 0.6 + 0.002 * Math.sin(frame * 2.1)),
      hand(0.7, 0.6 + 0.002 * Math.sin(frame * 2.8)),
    ]);
    expect(peakCharge(frames)).toBe(0);
    expect(casts(frames)).toEqual([]);
  });

  it("does not charge from two opposing fists", () => {
    const frames = replay(new SixSevenDetector(), 0, 4000, (time) => opposing(time, 1.6, { pose: "fist" }));
    expect(peakCharge(frames)).toBe(0);
    expect(casts(frames)).toEqual([]);
  });

  it("does not charge when hands are oriented facing the camera (Shield pose)", () => {
    const frames = replay(new SixSevenDetector(), 0, 4000, (time) => opposing(time, 1.6, { angle: 0, flatDepth: true }));
    expect(peakCharge(frames)).toBe(0);
    expect(casts(frames)).toEqual([]);
  });

  it("does not charge when hands are upside down", () => {
    const frames = replay(new SixSevenDetector(), 0, 4000, (time) => {
      const raw = opposing(time, 1.6);
      // Flip hands vertically so wrist is above knuckles
      const flipped = raw.map((hand) => hand.map((p) => ({ ...p, y: 1 - p.y })));
      return flipped;
    });
    expect(peakCharge(frames)).toBe(0);
    expect(casts(frames)).toEqual([]);
  });

  it("recovers from a brief hand dropout without creating an extra swap", () => {
    const full = replay(new SixSevenDetector(), 0, 3200, (time) => opposing(time));
    const interrupted = replay(new SixSevenDetector(), 0, 3200, (time) =>
      time >= 1400 && time < 1500 ? [opposing(time)[0]] : opposing(time));
    expect(casts(interrupted)).toEqual([]);
    expect(interrupted.at(-1)!.charge).toBeGreaterThan(0.2);
    // Frames 42–44 contain only one hand. The bar must hold its prior charge,
    // and frame 45 must not turn the reacquisition jump into another swap.
    const beforeGap = interrupted[41];
    expect(interrupted.slice(42, 45).map((frame) => frame.charge)).toEqual([
      beforeGap.charge, beforeGap.charge, beforeGap.charge,
    ]);
    expect(interrupted[45].swapsPerSec).toBeLessThanOrEqual(beforeGap.swapsPerSec);
    expect(interrupted.at(-1)!.charge).toBeGreaterThan(beforeGap.charge);
    expect(interrupted.at(-1)!.charge).toBeLessThanOrEqual(full.at(-1)!.charge + 0.02);
  });

  it("cancels a charge after sustained tracking loss without firing", () => {
    const detector = new SixSevenDetector();
    const moving = replay(detector, 0, 2600, (time) => opposing(time));
    expect(peakCharge(moving)).toBeGreaterThan(0.2);
    const missing = replay(detector, 2600, 3900, () => []);
    expect(casts(missing)).toEqual([]);
    expect(missing.at(-1)!.charge).toBe(0);
    expect(missing.at(-1)!.engaged).toBe(false);
    const recovered = replay(detector, 3900, 5200, () => opposing(2600));
    expect(casts(recovered)).toEqual([]);
    expect(peakCharge(recovered)).toBe(0);
  });

  it.each([
    { hz: 0.9, gapMs: 100 },
    { hz: 1.2, gapMs: 200 },
  ])("does not release ongoing $hz Hz motion after a $gapMs ms dropout", ({ hz, gapMs }) => {
    const detector = new SixSevenDetector();
    // At 50 fps these gaps previously discarded a reversal and let the old
    // last-swap timer fire while the reacquired hands were still moving.
    const moving = replay(detector, 0, 5000, (time) =>
      time >= 2500 && time < 2500 + gapMs ? [] : opposing(time, hz), 50);
    expect(casts(moving)).toEqual([]);
    expect(moving.at(-1)!.charge).toBeGreaterThan(0.2);
    const stopped = replay(detector, 5000, 7000, () => opposing(5000, hz), 50);
    expect(casts(stopped)).toHaveLength(1);
    expect(stopped.at(-1)!.charge).toBe(0);
  });

  it("clears the pending release and motion history when reset", () => {
    const detector = new SixSevenDetector();
    const moving = replay(detector, 0, 2600, (time) => opposing(time));
    expect(peakCharge(moving)).toBeGreaterThan(0.2);
    detector.reset();
    const still = replay(detector, 0, 2000, () => opposing(2600));
    expect(casts(still)).toEqual([]);
    expect(peakCharge(still)).toBe(0);
    expect(still.every((frame) => frame.swapsPerSec === 0)).toBe(true);
  });

  it("does not mistake hand size changes for vertical swaps", () => {
    const frames = replay(new SixSevenDetector(), 0, 4000, (time) => {
      const scale = 1 + 0.30 * Math.sin(time / 1000 * 2 * Math.PI * 1.6);
      return [hand(0.3, 0.52, { scale }), hand(0.7, 0.68, { scale })];
    });
    expect(peakCharge(frames)).toBe(0);
    expect(casts(frames)).toEqual([]);
  });

  it("is unaffected when the camera reverses its hand detection order", () => {
    const ordered = replay(new SixSevenDetector(), 0, 3200, (time) => opposing(time));
    const reordered = replay(new SixSevenDetector(), 0, 3200, (time, frame) => {
      const pair = opposing(time);
      return frame % 2 === 0 ? pair.reverse() : pair;
    });
    expect(reordered).toEqual(ordered);
  });

  it("accepts opposite bobs with a modest timing difference between the hands", () => {
    const frames = replay(new SixSevenDetector(), 0, 3600, (time) => [
      opposing(time)[0], opposing(time - 75)[1],
    ]);
    expect(peakCharge(frames)).toBeGreaterThan(0.2);
    expect(casts(frames)).toEqual([]);
  });

  it.each([
    { aspect: 16 / 9, scale: 0.8 },
    { aspect: 4 / 3, scale: 1 },
    { aspect: 3 / 4, scale: 1.25 },
  ])("detects tilted palms through the camera filters at aspect $aspect and scale $scale", (options) => {
    const stabilizer = new HandStabilizer();
    const frames = replay(new SixSevenDetector(), 0, 4000, (time) => {
      const tilt = 25 * Math.sin(time / 1000 * 2 * Math.PI * 1.6);
      const raw = [
        hand(0.3, 0.6, { ...options, angle: 55 + tilt }),
        hand(0.7, 0.6, { ...options, angle: 55 - tilt }),
      ];
      stabilizer.update(filterHands(raw), time);
      return stabilizer.getObservedHands();
    }, 30, options.aspect);
    expect(peakCharge(frames)).toBeGreaterThan(0.2);
    expect(casts(frames)).toEqual([]);
  });

  it.each([
    { aspect: 16 / 9, scale: 0.8 },
    { aspect: 4 / 3, scale: 1 },
    { aspect: 3 / 4, scale: 1.25 },
  ])("detects flat camera depth through the filters at aspect $aspect and scale $scale", (options) => {
    const stabilizer = new HandStabilizer();
    const frames = replay(new SixSevenDetector(), 0, 4000, (time) => {
      const raw = opposing(time, 1.6, { ...options, flatDepth: true, pose: "relaxed" });
      stabilizer.update(filterHands(raw), time);
      return stabilizer.getObservedHands();
    }, 30, options.aspect);
    expect(peakCharge(frames)).toBeGreaterThan(0.2);
    expect(casts(frames)).toEqual([]);
  });

  it.each([75, 80])("detects an edge-on palm at %s degrees when camera depth is flat", (angle) => {
    const stabilizer = new HandStabilizer();
    const frames = replay(new SixSevenDetector(), 0, 4000, (time) => {
      const raw = opposing(time, 1.6, { flatDepth: true, angle });
      expect(filterHands(raw)).toHaveLength(2);
      stabilizer.update(filterHands(raw), time);
      return stabilizer.getObservedHands();
    });
    expect(peakCharge(frames)).toBeGreaterThan(0.2);
    expect(casts(frames)).toEqual([]);
  });

  it("does not treat held camera landmarks as a visible stop before the release timeout", () => {
    const visibleStabilizer = new HandStabilizer();
    const visible = replay(new SixSevenDetector(), 0, 5200, (time) => {
      visibleStabilizer.update(filterHands(opposing(Math.min(time, 3200))), time);
      return visibleStabilizer.getObservedHands();
    }, 50);
    expect(casts(visible)).toHaveLength(1);
    const releaseAt = visible.findIndex((frame) => frame.castPower !== null) * 20;
    // Lose one hand just before an otherwise valid release. The stabilizer
    // retains its drawing briefly, but the detector must only see fresh hands.
    const lostAt = releaseAt - 40;
    expect(lostAt).toBeGreaterThan(3200);
    const stabilizer = new HandStabilizer();
    let heldPairFrames = 0;
    const interrupted = replay(new SixSevenDetector(), 0, 5200, (time) => {
      const raw = opposing(Math.min(time, 3200));
      const displayed = stabilizer.update(filterHands(time >= lostAt ? [raw[0]] : raw), time);
      const observed = stabilizer.getObservedHands();
      if (time >= lostAt && displayed.length === 2 && observed.length === 1) heldPairFrames++;
      return observed;
    }, 50);
    expect(heldPairFrames).toBeGreaterThan(0);
    expect(casts(interrupted)).toEqual([]);
    expect(interrupted.at(-1)!.charge).toBe(0);
  });
});
