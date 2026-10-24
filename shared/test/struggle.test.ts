import { describe, expect, it } from "vitest";
import { DEFAULT_MATCH_CONFIG as C, DuelEngine, type GameEvent, type PlayerSlot } from "../src/index.js";

const START = 10_000;
const LIVE = START + C.countdownMs;
const { durationMs, pushStep, minPushGapMs } = C.struggle;
const PUSHES_TO_WIN = Math.ceil(1 / pushStep);

function liveEngine() {
  const engine = new DuelEngine(START, C, () => 0.1);
  engine.tick(LIVE);
  engine.drainEvents();
  return engine;
}

/** Two fireballs cast close together, ticked forward until they lock. */
function lockedEngine() {
  const engine = liveEngine();
  engine.cast("A", "fireball", LIVE);
  engine.cast("B", "fireball", LIVE + 100);
  let now = LIVE + 100;
  while (!engine.snapshot(now).struggle) now += 10;
  engine.drainEvents();
  return { engine, lockedAt: now };
}

/** Pushes `count` times at a legal pace; returns the time after the last push. */
function pushes(engine: DuelEngine, slot: PlayerSlot, count: number, from: number) {
  let now = from;
  for (let i = 0; i < count; i++) {
    now += minPushGapMs;
    engine.push(slot, now);
  }
  return now;
}

const find = <T extends GameEvent["type"]>(events: GameEvent[], type: T) => events.find((e) => e.type === type) as Extract<GameEvent, { type: T }> | undefined;

describe("spell struggle", () => {
  it("locks matching spells together instead of fizzling them", () => {
    const engine = liveEngine();
    engine.cast("A", "fireball", LIVE);
    engine.cast("B", "fireball", LIVE + 100);
    engine.tick(LIVE + 1_000);
    const state = engine.snapshot(LIVE + 1_000);
    expect(state.struggle?.spell).toBe("fireball");
    expect(state.projectiles).toHaveLength(0);
    expect(find(engine.drainEvents(), "STRUGGLE_START")).toBeTruthy();
  });

  it("leaves different spells to the instant clash", () => {
    const engine = liveEngine();
    engine.cast("A", "fireball", LIVE);
    engine.cast("B", "ice", LIVE + 100);
    expect(engine.snapshot(LIVE + 600).struggle).toBeNull();
  });

  it("shoving it all the way wins, and the loser takes both spells' damage", () => {
    const { engine, lockedAt } = lockedEngine();
    const end = pushes(engine, "A", PUSHES_TO_WIN, lockedAt);
    const clash = find(engine.drainEvents(), "SPELL_CLASH");
    expect(clash?.winner).toBe("A");
    expect(engine.snapshot(end).struggle).toBeNull();
    const state = engine.snapshot(end + 2_000);
    expect(state.players.B.hp).toBe(100 - 2 * C.spells.fireball.damage);
    expect(state.players.A.hp).toBe(100);
    expect(state.players.A.stats.clashesWon).toBe(1);
  });

  it("the faster pusher wins a contested struggle", () => {
    const { engine, lockedAt } = lockedEngine();
    // B pushes every other A push: A should still drive it home.
    let now = lockedAt;
    for (let i = 0; i < 40 && engine.snapshot(now).struggle; i++) {
      now += minPushGapMs;
      engine.push("A", now);
      if (i % 2 === 0) engine.push("B", now);
    }
    expect(find(engine.drainEvents(), "SPELL_CLASH")?.winner).toBe("A");
  });

  it("at time-out the leader wins", () => {
    const { engine, lockedAt } = lockedEngine();
    pushes(engine, "B", 5, lockedAt);
    engine.tick(lockedAt + durationMs + 1);
    expect(find(engine.drainEvents(), "SPELL_CLASH")?.winner).toBe("B");
  });

  it("a dead heat fizzles both spells", () => {
    const { engine, lockedAt } = lockedEngine();
    engine.tick(lockedAt + durationMs + 1);
    const clash = find(engine.drainEvents(), "SPELL_CLASH");
    expect(clash?.winner).toBeNull();
    const state = engine.snapshot(lockedAt + durationMs + 3_000);
    expect(state.players.A.hp).toBe(100);
    expect(state.players.B.hp).toBe(100);
  });

  it("ignores pushes that come too fast", () => {
    const { engine, lockedAt } = lockedEngine();
    expect(engine.push("A", lockedAt + minPushGapMs)).toBe(true);
    expect(engine.push("A", lockedAt + minPushGapMs + 1)).toBe(false);
    expect(engine.snapshot(lockedAt + minPushGapMs + 1).struggle?.pushes.A).toBe(1);
  });

  it("does nothing without a struggle", () => {
    const engine = liveEngine();
    expect(engine.push("A", LIVE + 100)).toBe(false);
  });
});
