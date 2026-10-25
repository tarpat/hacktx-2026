import { describe, expect, it } from "vitest";
import { matchRacePose, tonguePixels, type RaceFrame } from "../src/gesture/racePoseMatcher";
import type { Landmark } from "../src/gesture/types";

const point = (x: number, y: number): Landmark => ({ x, y, z: 0 });
function frame(): RaceFrame {
  const face = Array.from({ length: 478 }, () => point(0.5, 0.4));
  face[234] = point(.3, .4); face[454] = point(.7, .4);
  face[13] = point(.5, .48); face[14] = point(.5, .49);
  face[61] = point(.42, .48); face[291] = point(.58, .48); face[152] = point(.5, .65);
  return { face, hands: [], jawOpen: 0, smile: 0, tongueVisible: false, aspect: 1 };
}
function hand(x: number, y: number, raised: number[] = []): Landmark[] {
  const points = Array.from({ length: 21 }, () => point(x, y));
  points[0] = point(x, y + .15);
  for (const [pip, tip] of [[6, 8], [10, 12], [14, 16], [18, 20]]) {
    points[pip] = point(x, y);
    points[tip] = point(x, raised.includes(tip) ? y - .12 : y + .08);
  }
  return points;
}

describe("reference pose geometry", () => {
  it("requires a visible face", () => {
    expect(matchRacePose("think", { ...frame(), face: [] }).matched).toBeNull();
  });
  it("recognizes finger to closed mouth with either hand; rejects a palm or open mouth", () => {
    const f = frame(); f.hands = [hand(.51, .6, [8])];
    expect(matchRacePose("think", f).matched).toBe(true);
    expect(matchRacePose("think-again", { ...f, hands: [hand(.49, .6, [8])] }).matched).toBe(true);
    expect(matchRacePose("think", { ...f, hands: [hand(.51, .6, [8, 12, 16, 20])] }).matched).toBe(false);
    expect(matchRacePose("think", { ...f, jawOpen: .8 }).matched).toBe(false);
  });
  it("does not confuse a plain open mouth with tongue out", () => {
    const f = frame(); f.face[14] = point(.5, .57); f.jawOpen = .8;
    expect(matchRacePose("tongue", f).matched).toBe(false);
    expect(matchRacePose("tongue", { ...f, tongueVisible: true }).matched).toBe(true);
    expect(matchRacePose("tongue", { ...f, tongueVisible: true, hands: [hand(.5, .55)] }).matched).toBe(false);
  });
  it("requires two nearby hands below the chin and a gasp", () => {
    const f = frame(); f.face[14] = point(.5, .57); f.jawOpen = .8;
    f.hands = [hand(.43, .78), hand(.57, .78)];
    expect(matchRacePose("gasp", f).matched).toBe(true);
    expect(matchRacePose("gasp", { ...f, hands: f.hands.slice(0, 1) }).matched).toBe(false);
    expect(matchRacePose("gasp", { ...f, jawOpen: 0 }).matched).toBe(false);
    expect(matchRacePose("gasp", { ...f, hands: [hand(.1, .8), hand(.9, .8)] }).matched).toBe(false);
  });
  it.each([8, 12])("accepts a raised finger at landmark %i with a small smile, using either hand", (tip) => {
    const f = frame(); f.hands = [hand(.78, .4, [tip])]; f.smile = .2;
    expect(matchRacePose("grin", f).matched).toBe(true);
    expect(matchRacePose("grin", { ...f, hands: f.hands.map((h) => h.map((p) => ({ ...p, x: 1 - p.x }))) }).matched).toBe(true);
  });
  it("accepts a slightly bent raised finger and naturally loose neighboring fingers", () => {
    const f = frame(); const h = hand(.78, .4, [12]); f.smile = .2;
    // Check a gently bent raised finger and loosely curled neighbors separately:
    // a single finger must still stand out from its neighbors.
    h[12].y = .55 - .15 * 1.13;
    expect(matchRacePose("grin", { ...f, hands: [h] }).matched).toBe(true);
    h[12].y = .28;
    for (const tip of [8, 16, 20]) h[tip].y = .55 - .15 * 1.14;
    expect(matchRacePose("grin", { ...f, hands: [h] }).matched).toBe(true);
  });
  it("uses depth when the raised finger is foreshortened toward the camera", () => {
    const f = frame(); const h = hand(.78, .4, [12]); f.smile = .2;
    h[12] = { x: .78, y: .44, z: -.22 };
    expect(matchRacePose("grin", { ...f, hands: [h] }).matched).toBe(true);
  });
  it("accepts a tilted hand and a fingertip below mouth level", () => {
    const f = frame(); f.smile = .2;
    expect(matchRacePose("grin", { ...f, hands: [hand(.78, .64, [12])] }).matched).toBe(true);
    const h = hand(.65, .4, [12]); const wrist = h[0]; const angle = Math.PI / 5;
    const tilted = h.map((p) => point(wrist.x + (p.x - wrist.x) * Math.cos(angle) - (p.y - wrist.y) * Math.sin(angle), wrist.y + (p.x - wrist.x) * Math.sin(angle) + (p.y - wrist.y) * Math.cos(angle)));
    expect(matchRacePose("grin", { ...f, hands: [tilted] }).matched).toBe(true);
  });
  it("stays matched through small landmark changes during a hold", () => {
    const f = frame(); f.smile = .2;
    for (const jitter of [-.006, .004, -.003, .006, 0, -.005]) {
      const h = hand(.78, .4, [12]);
      for (const tip of [8, 16, 20]) h[tip].y = .55 - .15 * 1.14 + jitter;
      h[12].y += jitter;
      expect(matchRacePose("grin", { ...f, hands: [h] }).matched).toBe(true);
    }
  });
  it.each([
    { name: "fist", raised: [] }, { name: "victory sign", raised: [8, 12] },
    { name: "open palm", raised: [8, 12, 16, 20] }, { name: "ring finger", raised: [16] }, { name: "pinky", raised: [20] },
  ])("rejects $name", ({ raised }) => {
    const f = frame(); f.smile = .7;
    expect(matchRacePose("grin", { ...f, hands: [hand(.78, .4, raised)] }).matched).toBe(false);
  });
  it("asks for a smile only once the hand matches", () => {
    const f = frame(); f.hands = [hand(.78, .4, [12])];
    expect(matchRacePose("grin", f)).toEqual({ matched: false, hint: "Hand matched — add a small smile" });
    expect(matchRacePose("grin", { ...f, smile: .1 }).matched).toBe(false);
    expect(matchRacePose("grin", { ...f, hands: [] }).hint).toBe("Show one hand beside your face");
    const downward = hand(.78, .4, [12]).map((p) => ({ ...p, y: 1.1 - p.y }));
    expect(matchRacePose("grin", { ...f, hands: [downward] }).hint).toContain("upward");
    expect(matchRacePose("grin", { ...f, hands: [hand(.78, .95, [12])] }).hint).toContain("beside your face");
  });
  it("keeps matching when face and hand geometry are scaled or translated together", () => {
    const f = frame(); f.hands = [hand(.51, .6, [8])];
    const transform = (p: Landmark) => point(p.x * .7 + .1, p.y * .7 + .05);
    expect(matchRacePose("think", { ...f, face: f.face.map(transform), hands: f.hands.map((h) => h.map(transform)) }).matched).toBe(true);
  });
  it("rejects dark mouth, white teeth and skin but accepts a red tongue region", () => {
    const pixels = (r: number, g: number, b: number) => new Uint8ClampedArray(Array.from({ length: 100 }, () => [r, g, b, 255]).flat());
    expect(tonguePixels(pixels(20, 10, 10), 10, 10, 25)).toBe(false);
    expect(tonguePixels(pixels(230, 225, 220), 10, 10, 25)).toBe(false);
    expect(tonguePixels(pixels(175, 145, 130), 10, 10, 25)).toBe(false);
    expect(tonguePixels(pixels(190, 90, 115), 10, 10, 25)).toBe(true);
  });
});
