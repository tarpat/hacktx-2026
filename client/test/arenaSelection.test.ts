import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalDuel } from "../src/game/duelSource";

vi.mock("../src/socket", () => ({ socket: {} }));

describe("local match arenas", () => {
  const sources: LocalDuel[] = [];
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { sources.splice(0).forEach((source) => source.dispose()); vi.restoreAllMocks(); vi.useRealTimers(); });

  it.each(["bot"] as const)("draws all three arenas for %s without excluding the previous one", (mode) => {
    const random = vi.spyOn(Math, "random").mockReturnValue(.8);
    const source = new LocalDuel(mode); sources.push(source);
    expect(source.state().stageId).toBe(2);
    source.rematch();
    expect(source.state().stageId).toBe(2);
    random.mockReturnValue(.1); source.rematch();
    expect(source.state().stageId).toBe(0);
    random.mockReturnValue(.5); source.rematch();
    expect(source.state().stageId).toBe(1);
    random.mockReturnValue(.9);
    vi.advanceTimersByTime(500);
    expect(source.state().stageId).toBe(1); // A live match keeps its selection between snapshots.
  });

  it("leaves arena selection to the training picker across rematches", () => {
    vi.spyOn(Math, "random").mockReturnValue(.8);
    const source = new LocalDuel("training"); sources.push(source);
    expect(source.state().stageId).toBeUndefined();
    source.rematch();
    expect(source.state().stageId).toBeUndefined();
  });
});
