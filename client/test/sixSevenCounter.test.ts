import { describe, expect, it } from "vitest";
import { DEFAULT_MATCH_CONFIG, DuelEngine } from "@spellcaster/shared";
import { SixSevenCounter, type BodyLandmark } from "../src/gesture/sixSevenCounter";

export function body(leftUp = false, rightUp = false): BodyLandmark[] {
  const points = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
  points[11].x = 0.3; points[12].x = 0.7;
  points[13].y = points[14].y = 0.55;
  points[15].y = leftUp ? 0.43 : 0.67;
  points[16].y = rightUp ? 0.43 : 0.67;
  return points;
}

function harness() {
  const counter = new SixSevenCounter();
  let now = 0;
  const frame = (points: BodyLandmark[]) => counter.update(points, now += 50);
  const hold = (points: BodyLandmark[]) => { frame(points); return frame(points); };
  return { counter, frame, hold };
}

describe("6–7 elbow/wrist counter", () => {
  it("uses the initial position as a baseline, including an already raised wrist", () => {
    const { hold } = harness();
    expect(hold(body(true)).push).toBe(false);
    expect(hold(body(true)).push).toBe(false);
  });

  it("counts either forearm rising, once per confirmed down-to-up motion", () => {
    const { hold } = harness();
    hold(body());
    expect(hold(body(true)).push).toBe(true);
    expect(hold(body(true)).push).toBe(false);
    expect(hold(body(false, true)).push).toBe(true);
    expect(hold(body()).push).toBe(false);
    expect(hold(body(true)).push).toBe(true);
  });

  it("counts simultaneous wrist lifts as one beat", () => {
    const { hold } = harness();
    hold(body());
    expect(hold(body(true, true)).push).toBe(true);
    expect(hold(body(true, true)).push).toBe(false);
  });

  it("ignores a single frame misread and jitter around elbow height", () => {
    const { hold, frame } = harness();
    hold(body());
    expect(frame(body(true)).push).toBe(false);
    expect(frame(body()).push).toBe(false);
    for (let i = 0; i < 12; i++) {
      const points = body();
      points[15].y = 0.55 + (i % 2 ? 0.01 : -0.01);
      expect(frame(points).push).toBe(false);
    }
    expect(hold(body(true)).push).toBe(true);
  });

  it("requires elapsed confirmation time even when many frames arrive", () => {
    const counter = new SixSevenCounter();
    counter.update(body(), 0); counter.update(body(), 50);
    for (let t = 60; t < 105; t++) expect(counter.update(body(true), t).push).toBe(false);
    expect(counter.update(body(true), 105).push).toBe(true);
  });

  it.each([13, 14, 15, 16])("requires visible elbow/wrist landmark %i and clears stale baselines", (index) => {
    const { hold } = harness();
    hold(body());
    const points = body(true);
    points[index].visibility = 0.49;
    const missing = hold(points);
    expect(missing.visible).toBe(false);
    expect(missing.push).toBe(false);
    expect(hold(body(true)).push).toBe(false);
    hold(body());
    expect(hold(body(true)).push).toBe(true);
  });

  it.each([NaN, Infinity, -0.1, 1.1])("rejects invalid or out-of-frame coordinates: %s", (x) => {
    const { hold } = harness();
    hold(body());
    const points = body(true); points[15].x = x;
    expect(hold(points).visible).toBe(false);
    expect(hold(points).push).toBe(false);
  });

  it("does not score when a body returns after a dropout or a frame gap", () => {
    const { counter, hold } = harness();
    hold(body());
    expect(hold([]).push).toBe(false);
    expect(hold(body(true)).push).toBe(false);
    counter.reset();
    counter.update(body(), 1000); counter.update(body(), 1050);
    expect(counter.update(body(true), 1400).push).toBe(false);
    expect(counter.update(body(true), 1450).push).toBe(false);
  });

  it("reset between collisions requires a fresh baseline", () => {
    const { counter, hold } = harness();
    hold(body());
    counter.reset();
    expect(hold(body(true)).push).toBe(false);
  });

  it("rejects duplicate/out-of-order timestamps without creating a crossing", () => {
    const counter = new SixSevenCounter();
    counter.update(body(), 100); counter.update(body(), 150);
    expect(counter.update(body(true), 150).push).toBe(false);
    expect(counter.update(body(true), 149).push).toBe(false);
    expect(counter.update(body(true), 200).push).toBe(false);
    expect(counter.update(body(true), 250).push).toBe(true);
  });

  it("feeds real gesture beats through the duel engine to resolve a collision and damage", () => {
    const engine = new DuelEngine(0, DEFAULT_MATCH_CONFIG, () => 0.1);
    engine.tick(3000); engine.cast("A", "fireball", 3000); engine.cast("B", "fireball", 3000);
    let now = 3800;
    expect(engine.snapshot(now).struggle?.kind).toBe("pump");
    const counter = new SixSevenCounter();
    for (let beat = 0; beat < 15; beat++) {
      for (const points of [body(), body(), body(true), body(true)]) {
        now += 50;
        if (counter.update(points, now).push) engine.push("A", now);
      }
    }
    expect(engine.snapshot(now).struggle).toBeNull();
    expect(engine.drainEvents()).toContainEqual(expect.objectContaining({ type: "SPELL_CLASH", winner: "A" }));
    expect(engine.snapshot(now + 2000).players.B.hp).toBe(60);
  });
});
