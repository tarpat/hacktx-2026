import { test } from "node:test";
import assert from "node:assert/strict";
import { DuelEngine, makeMatchConfig, type GameEvent, type MatchState } from "@spellcaster/shared";
import { combatCue, connectCombatAudio } from "../../src/audio/combat.ts";
import type { CueId } from "../../src/audio/cues.ts";

class Source {
  current: MatchState | null = null;
  clock = 10_000;
  listeners = new Set<(state: MatchState, events: GameEvent[]) => void>();
  now = () => this.clock;
  state = () => this.current;
  subscribe(listener: (state: MatchState, events: GameEvent[]) => void) {
    this.listeners.add(listener);
    if (this.current) listener(this.current, []);
    return () => { this.listeners.delete(listener); };
  }
  emit(events: GameEvent[], state = snapshot(this.clock)) {
    this.current = state;
    for (const listener of this.listeners) listener(state, events);
  }
}

function snapshot(now: number): MatchState {
  return new DuelEngine(now - 3_000).snapshot(now);
}
function cast(id = 1, at = 10_000): GameEvent {
  return { id, at, type: "SPELL_CAST", slot: "A", spell: "fireball", projectileId: `A${id}`, empowered: false };
}
function setup() {
  const source = new Source();
  const played: CueId[] = [];
  let stops = 0;
  const disconnect = connectCombatAudio(source, {
    async play(cue) { played.push(cue); return "played"; },
    stopAll() { stops++; },
  });
  return { source, played, disconnect, stops: () => stops };
}

test("confirmed fireball and shield casts map distinctly; rejects and stretch events stay silent", () => {
  assert.equal(combatCue(cast()), "cast");
  assert.equal(combatCue({ ...cast(), type: "SPELL_CAST", spell: "shield", slot: "B", projectileId: null, empowered: false }), "shield");
  for (const reason of ["cooldown", "frozen", "not_active", "meter", "duplicate", "unknown"] as const) {
    assert.equal(combatCue({ id: 2, at: 10_000, type: "CAST_REJECTED", slot: "A", spell: "fireball", reason }), null);
  }
  assert.equal(combatCue({ ...cast(), type: "SPELL_CAST", spell: "ice", slot: "A", projectileId: "A2", empowered: false }), null);
  assert.equal(combatCue({ id: 3, at: 10_000, type: "MATCH_END", winner: "A", reason: "knockout" }), null);
  assert.equal(combatCue({ id: 4, at: 10_000, type: "DAMAGE_APPLIED", target: "B", spell: "fireball", amount: 0, hp: 100 }), null);
});

test("duplicate events and repeated batches play once; distinct consecutive casts both play", () => {
  const { source, played } = setup();
  source.emit([cast(), cast()]);
  source.emit([cast()]);
  source.emit([cast(2)]);
  assert.deepEqual(played, ["cast", "cast"]);
});

test("batch processing sorts a copy without mutating events needed by visuals", () => {
  const { source, played } = setup();
  const events = [cast(2), cast(1)];
  source.emit(events);
  assert.deepEqual(events.map((event) => event.id), [2, 1]);
  assert.deepEqual(played, ["cast", "cast"]);
});

test("state-only snapshots and rejected casts do not invent cues", () => {
  const { source, played } = setup();
  source.emit([]);
  source.emit([{ id: 1, at: 10_000, type: "CAST_REJECTED", slot: "A", spell: "fireball", reason: "cooldown" }]);
  assert.deepEqual(played, []);
});

test("expired, future and invalid events are silent", () => {
  const { source, played } = setup();
  source.emit([cast(1, 8_499), cast(2, 11_000), cast(-1), cast(2.5), cast(3, NaN)]);
  assert.deepEqual(played, []);
  source.emit([cast(4, 10_000)]);
  assert.deepEqual(played, ["cast"]);
});

test("attaching mid-match does not replay history from before attachment", () => {
  const source = new Source();
  source.current = snapshot(10_000);
  const played: CueId[] = [];
  connectCombatAudio(source, { async play(cue) { played.push(cue); return "played"; }, stopAll() {} });
  source.emit([cast(1, 9_999), cast(2)]);
  assert.deepEqual(played, ["cast"]);
});

test("new countdown resets IDs, cancels audio and rejects old match events", () => {
  const { source, played, stops } = setup();
  source.emit([cast(100)]);
  source.clock = 11_000;
  source.emit([], new DuelEngine(11_000).snapshot(11_000));
  assert.equal(stops(), 1);
  source.emit([cast(500, 10_000)], new DuelEngine(11_000).snapshot(11_000));
  source.clock = 14_000;
  source.emit([cast(1, 14_000)]);
  assert.deepEqual(played, ["cast", "cast"]);
});

test("out-of-order snapshots cannot reset the current match", () => {
  const { source, played, stops } = setup();
  source.emit([cast(1)]);
  source.emit([], new DuelEngine(9_000).snapshot(9_000));
  source.emit([cast(1), cast(2)]);
  assert.equal(stops(), 0);
  assert.deepEqual(played, ["cast", "cast"]);
});

test("disconnect unsubscribes and stops pending playback exactly once", () => {
  const { source, played, disconnect, stops } = setup();
  disconnect(); disconnect();
  source.emit([cast()]);
  assert.equal(source.listeners.size, 0);
  assert.equal(stops(), 1);
  assert.deepEqual(played, []);
});

test("two listeners hear a real engine block without a damage cue", () => {
  const source = new Source();
  const heard: CueId[][] = [[], []];
  for (const cues of heard) connectCombatAudio(source, { async play(cue) { cues.push(cue); return "played"; }, stopAll() {} });
  const engine = new DuelEngine(10_000, makeMatchConfig({ countdownMs: 0 }));
  engine.cast("A", "fireball", 10_000);
  source.emit(engine.drainEvents(), engine.snapshot(10_000));
  engine.cast("B", "shield", 10_100);
  source.clock = 10_100;
  source.emit(engine.drainEvents(), engine.snapshot(10_100));
  source.clock = 10_900;
  const state = engine.snapshot(source.clock);
  source.emit(engine.drainEvents(), state);
  assert.equal(state.players.B.hp, 100);
  assert.deepEqual(heard, [["cast", "shield", "block"], ["cast", "shield", "block"]]);
});

test("real engine hit and cooldown rejection produce only one cast and one hit", () => {
  const { source, played } = setup();
  const engine = new DuelEngine(10_000, makeMatchConfig({ countdownMs: 0 }));
  engine.cast("A", "fireball", 10_000);
  engine.cast("A", "fireball", 10_001);
  source.clock = 10_001;
  source.emit(engine.drainEvents(), engine.snapshot(source.clock));
  source.clock = 10_900;
  const state = engine.snapshot(source.clock);
  source.emit(engine.drainEvents(), state);
  assert.equal(state.players.B.hp, 80);
  assert.deepEqual(played, ["cast", "hit"]);
});

test("partial ultimate block keeps the independently confirmed damage cue", () => {
  const { source, played } = setup();
  source.emit([
    { id: 1, at: 10_000, type: "SPELL_BLOCKED", defender: "B", spell: "ultimate", damage: 15 },
    { id: 2, at: 10_000, type: "DAMAGE_APPLIED", target: "B", spell: "ultimate", amount: 15, hp: 85 },
  ]);
  assert.deepEqual(played, ["block", "hit"]);
});

test("silent playback results are still consumed; unmuting/enabling cannot replay the event", () => {
  const source = new Source();
  let attempts = 0;
  connectCombatAudio(source, { async play() { attempts++; return "muted"; }, stopAll() {} });
  source.emit([cast()]);
  source.emit([cast()]);
  assert.equal(attempts, 1);
});
