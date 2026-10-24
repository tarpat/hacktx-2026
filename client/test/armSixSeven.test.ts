import { describe, expect, it } from "vitest";
import { ArmSixSevenDetector, armStance, type ArmSixSevenUpdate, type PoseLandmark } from "../src/gesture/armSixSeven";
import type { Landmark } from "../src/gesture/types";

const ASPECT = 4 / 3;

interface PoseOptions {
  /** Wrist offsets below the elbow (image-height units), one per arm. */
  wristDrop?: [number, number];
  elbowY?: number;
  shoulderY?: number;
  visibility?: number;
  scale?: number;
  jitter?: number;
}

/** 33-point pose with only shoulders, elbows and wrists meaningful. Shoulder width ≈ 0.4 image heights. */
function pose(o: PoseOptions = {}): PoseLandmark[] {
  const { wristDrop = [0, 0], elbowY = 0.65, shoulderY = 0.4, visibility = 0.95, scale = 1, jitter = 0 } = o;
  const points: PoseLandmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));
  const cx = 0.5;
  const at = (dx: number, y: number, i: number) => ({
    x: cx + dx * scale,
    y: shoulderY + (y - shoulderY) * scale + jitter * Math.sin(i * 12.9898),
    z: 0,
    visibility,
  });
  points[11] = at(0.15, shoulderY, 11);
  points[12] = at(-0.15, shoulderY, 12);
  points[13] = at(0.17, elbowY, 13);
  points[14] = at(-0.17, elbowY, 14);
  points[15] = at(0.15, elbowY + wristDrop[0], 15);
  points[16] = at(-0.15, elbowY + wristDrop[1], 16);
  return points;
}

function bobbing(timeMs: number, hz = 1.6, amplitude = 0.05, extra: PoseOptions = {}) {
  const bob = amplitude * Math.sin(timeMs / 1000 * 2 * Math.PI * hz);
  return pose({ ...extra, wristDrop: [bob, -bob] });
}

/** Hand landmarks with wrist at (x, y); fingers point up by `up` image units (negative = down/forward). */
function hand(x: number, y: number, up: number): Landmark[] {
  // Middle fingertip (12) is the full `up` above the wrist; other points sit halfway.
  return Array.from({ length: 21 }, (_, i) => ({ x, y: i === 0 ? y : i === 12 ? y - up : y - up / 2, z: 0 }));
}

function replay(
  detector: ArmSixSevenDetector,
  fromMs: number,
  toMs: number,
  frameAt: (t: number, frame: number) => { pose: PoseLandmark[] | null; hands?: Landmark[][] },
  fps = 30,
): ArmSixSevenUpdate[] {
  const out: ArmSixSevenUpdate[] = [];
  const count = Math.round((toMs - fromMs) / 1000 * fps);
  for (let frame = 0; frame <= count; frame++) {
    const t = fromMs + (toMs - fromMs) * frame / count;
    const { pose: p, hands = [] } = frameAt(t, frame);
    out.push(detector.update(p, hands, t, ASPECT));
  }
  return out;
}

const peak = (f: ArmSixSevenUpdate[]) => Math.max(...f.map((x) => x.charge));
const casts = (f: ArmSixSevenUpdate[]) => f.flatMap((x) => (x.castPower === null ? [] : [x.castPower]));

describe("armStance", () => {
  it("accepts raised forearms with elbows down", () => {
    expect(armStance(pose(), [], ASPECT).status).toBe("READY");
  });
  it("rejects arms hanging down", () => {
    expect(armStance(pose({ wristDrop: [0.28, 0.28] }), [], ASPECT).status).toBe("ARMS_DOWN");
  });
  it("rejects hands raised above the shoulders", () => {
    expect(armStance(pose({ elbowY: 0.35, wristDrop: [-0.2, -0.2] }), [], ASPECT).status).toBe("HANDS_TOO_HIGH");
  });
  it("rejects arms out of frame or low visibility", () => {
    expect(armStance(pose({ visibility: 0.2 }), [], ASPECT).status).toBe("ARMS_NOT_VISIBLE");
    expect(armStance(pose({ elbowY: 0.9, wristDrop: [0.15, 0.15] }), [], ASPECT).status).toBe("ARMS_NOT_VISIBLE");
    expect(armStance(null, [], ASPECT).status).toBe("NO_POSE");
  });
  it("vetoes palms facing the camera (fingers pointing up) when hands are seen", () => {
    const p = pose();
    const shield = [hand(p[15].x, p[15].y, 0.2), hand(p[16].x, p[16].y, 0.2)];
    expect(armStance(p, shield, ASPECT).status).toBe("PALMS_FACING_CAMERA");
    const palmsUp = [hand(p[15].x, p[15].y, 0.03), hand(p[16].x, p[16].y, 0.03)];
    expect(armStance(p, palmsUp, ASPECT).status).toBe("READY");
  });
});

describe("ArmSixSevenDetector", () => {
  it("charges while forearms alternate and fires once after holding still", () => {
    const d = new ArmSixSevenDetector();
    const moving = replay(d, 0, 3000, (t) => ({ pose: bobbing(t) }));
    expect(peak(moving)).toBeGreaterThan(0.3);
    expect(casts(moving)).toEqual([]);
    const still = replay(d, 3000, 4500, () => ({ pose: bobbing(3000) }));
    expect(casts(still)).toHaveLength(1);
    expect(still.at(-1)!.charge).toBe(0);
  });

  it("fires despite small pose jitter while held still", () => {
    const d = new ArmSixSevenDetector();
    replay(d, 0, 3000, (t) => ({ pose: bobbing(t) }));
    const still = replay(d, 3000, 4500, (_t, f) => ({ pose: pose({ jitter: 0.004 * Math.sin(f) }) }));
    expect(casts(still)).toHaveLength(1);
  });

  it("charges faster for faster bobbing", () => {
    const slow = replay(new ArmSixSevenDetector(), 0, 2500, (t) => ({ pose: bobbing(t, 1.0) }));
    const fast = replay(new ArmSixSevenDetector(), 0, 2500, (t) => ({ pose: bobbing(t, 2.2) }));
    expect(peak(fast)).toBeGreaterThan(peak(slow) + 0.15);
  });

  it.each([15, 30, 60])("works at %i fps", (fps) => {
    const f = replay(new ArmSixSevenDetector(), 0, 2500, (t) => ({ pose: bobbing(t) }), fps);
    expect(f.at(-1)!.charge).toBeGreaterThan(0.2);
    expect(casts(f)).toEqual([]);
  });

  it.each([0.6, 1, 1.5])("is independent of distance from the camera (scale %s)", (scale) => {
    const f = replay(new ArmSixSevenDetector(), 0, 2500, (t) => ({ pose: bobbing(t, 1.6, 0.05, { scale }) }));
    expect(f.at(-1)!.charge).toBeGreaterThan(0.2);
  });

  it("charges even when hand landmarks are missing (fast motion blur)", () => {
    const f = replay(new ArmSixSevenDetector(), 0, 2500, (t) => ({ pose: bobbing(t), hands: [] }));
    expect(peak(f)).toBeGreaterThan(0.2);
  });

  it("ignores both hands moving together", () => {
    const f = replay(new ArmSixSevenDetector(), 0, 3000, (t) => {
      const bob = 0.05 * Math.sin(t / 1000 * 2 * Math.PI * 1.6);
      return { pose: pose({ wristDrop: [bob, bob] }) };
    });
    expect(peak(f)).toBe(0);
  });

  it("ignores one hand moving alone", () => {
    const f = replay(new ArmSixSevenDetector(), 0, 3000, (t) => {
      const bob = 0.05 * Math.sin(t / 1000 * 2 * Math.PI * 1.6);
      return { pose: pose({ wristDrop: [bob, 0] }) };
    });
    expect(peak(f)).toBe(0);
  });

  it("ignores small jitter", () => {
    const f = replay(new ArmSixSevenDetector(), 0, 3000, (_t, frame) => ({ pose: pose({ jitter: 0.006 * Math.sin(frame * 2.3) }) }));
    expect(peak(f)).toBe(0);
    expect(f.every((x) => !x.engaged)).toBe(true);
  });

  it("does not charge with palms facing the camera", () => {
    const f = replay(new ArmSixSevenDetector(), 0, 3000, (t) => {
      const p = bobbing(t);
      return { pose: p, hands: [hand(p[15].x, p[15].y, 0.2), hand(p[16].x, p[16].y, 0.2)] };
    });
    expect(peak(f)).toBe(0);
  });

  it("does not charge with arms hanging down", () => {
    const f = replay(new ArmSixSevenDetector(), 0, 3000, (t) => {
      const bob = 0.05 * Math.sin(t / 1000 * 2 * Math.PI * 1.6);
      return { pose: pose({ wristDrop: [0.3 + bob, 0.3 - bob] }) };
    });
    expect(peak(f)).toBe(0);
  });

  it("survives a brief tracking dropout but cancels after a long one without casting", () => {
    const d = new ArmSixSevenDetector();
    const brief = replay(d, 0, 3000, (t) => ({ pose: t >= 1500 && t < 1700 ? null : bobbing(t) }));
    expect(casts(brief)).toEqual([]);
    expect(brief.at(-1)!.charge).toBeGreaterThan(0.2);
    const lost = replay(d, 3000, 4000, () => ({ pose: null }));
    expect(casts(lost)).toEqual([]);
    expect(lost.at(-1)!.charge).toBe(0);
  });

  it("is not engaged by a still stance, so other spells keep working", () => {
    const f = replay(new ArmSixSevenDetector(), 0, 2000, () => ({ pose: pose() }));
    expect(f.every((x) => !x.engaged)).toBe(true);
  });
});
