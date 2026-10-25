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
  it("requires the middle finger alone, raised beside the face, and a grin", () => {
    const f = frame(); f.hands = [hand(.78, .4, [12])]; f.smile = .7;
    expect(matchRacePose("grin", f).matched).toBe(true);
    expect(matchRacePose("grin", { ...f, smile: 0 }).matched).toBe(false);
    expect(matchRacePose("grin", { ...f, hands: [hand(.78, .4, [8])] }).matched).toBe(false);
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
