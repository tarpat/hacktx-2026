import { describe, expect, it } from "vitest";
import { ARENA_IDS, randomStageId } from "../src/index.js";

describe("uniform arena selection", () => {
  it.each([
    [0, 0], [1 / 3 - .000001, 0], [1 / 3, 1],
    [.5, 1], [2 / 3 - .000001, 1], [2 / 3, 2], [.999999, 2],
  ])("maps random sample %s to stage %s", (sample, stage) => {
    expect(randomStageId(() => sample)).toBe(stage);
  });

  it("gives every configured arena the same share of the random interval", () => {
    const counts = ARENA_IDS.map(() => 0);
    const samples = ARENA_IDS.length * 1_000;
    for (let i = 0; i < samples; i++) counts[randomStageId(() => (i + .5) / samples)]++;
    expect(counts).toEqual(ARENA_IDS.map(() => 1_000));
  });

  it("allows the same arena on consecutive draws", () => {
    expect(Array.from({ length: 3 }, () => randomStageId(() => .8))).toEqual([2, 2, 2]);
  });
});
