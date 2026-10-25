import { describe, expect, it } from "vitest";
import { castBlocker, DEFAULT_MATCH_CONFIG as C, DuelBot, DuelEngine, rollTraits, TRAIT_ORDER, TRAINING_DUMMY, type PlayerSlot, type TraitId } from "../src/index.js";

const START = 10_000;
const LIVE = START + C.countdownMs;

function liveEngine(traits: Partial<Record<PlayerSlot, TraitId>>) {
  const engine = new DuelEngine(START, C, () => 0.1, traits);
  engine.tick(LIVE);
  engine.drainEvents();
  return engine;
}

describe("trait effects", () => {
  it("leaves both wizards untraited unless traits are passed in", () => {
    const { A, B } = new DuelEngine(START).snapshot(START).players;
    expect([A.trait, B.trait]).toEqual([null, null]);
    expect([A.maxHp, B.maxHp]).toEqual([C.maxHp, C.maxHp]);
  });

  it("Ironhide raises max health and starts at full", () => {
    const { A, B } = liveEngine({ A: "ironhide" }).snapshot(LIVE).players;
    expect(A.maxHp).toBe(Math.round(C.maxHp * C.traits.ironhide.factor));
    expect(A.hp).toBe(A.maxHp);
    expect(B.maxHp).toBe(C.maxHp);
  });

  it.each([["pyromancer", "fireball"], ["stampede", "taurus"]] as const)("%s makes %s hit harder", (trait, spell) => {
    const engine = liveEngine({ A: trait });
    engine.cast("A", spell, LIVE);
    engine.cast("B", spell, LIVE + 1_000); // Too late to collide, so both land.
    const { A, B } = engine.snapshot(LIVE + 1_000 + C.spells[spell].travelMs).players;
    expect(C.maxHp - B.hp).toBe(Math.round(C.spells[spell].damage * C.traits[trait].factor));
    expect(C.maxHp - A.hp).toBe(C.spells[spell].damage);
  });

  it("Frostbite stretches the freeze its Glacius inflicts", () => {
    const engine = liveEngine({ A: "frostbite" });
    engine.cast("A", "ice", LIVE);
    const hit = LIVE + C.spells.ice.travelMs;
    const frozenFor = C.freezeMs * C.traits.frostbite.factor;
    expect(engine.snapshot(hit).players.B.frozenUntil).toBe(hit + frozenFor);
    expect(engine.cast("B", "fireball", hit + frozenFor - 1)).toEqual({ ok: false, reason: "frozen" });
    expect(engine.cast("B", "fireball", hit + frozenFor)).toEqual({ ok: true });
  });

  it("Stormcaller charges Fulmen faster from every source", () => {
    const engine = liveEngine({ A: "stormcaller" });
    engine.cast("A", "fireball", LIVE);
    const { A, B } = engine.snapshot(LIVE + C.spells.fireball.travelMs).players;
    expect(A.ultimate).toBe(C.spells.fireball.damage * C.ultimateGain.perDamageDealt * C.traits.stormcaller.factor);
    expect(B.ultimate).toBe(C.spells.fireball.damage * C.ultimateGain.perDamageTaken);
  });

  it("Siphon heals part of the damage dealt, up to max health", () => {
    const engine = liveEngine({ A: "siphon" });
    engine.cast("A", "fireball", LIVE);
    expect(engine.snapshot(LIVE + C.spells.fireball.travelMs).players.A.hp).toBe(C.maxHp); // Already full.
    engine.cast("B", "fireball", LIVE + 2_000);
    engine.cast("A", "fireball", LIVE + 2_000 + C.spells.fireball.travelMs);
    const end = LIVE + 2_000 + 2 * C.spells.fireball.travelMs;
    const heal = Math.round(C.spells.fireball.damage * C.traits.siphon.factor);
    expect(engine.snapshot(end).players.A.hp).toBe(C.maxHp - C.spells.fireball.damage + heal);
  });
});

describe("rolling", () => {
  it("draws each wizard's trait independently from the full list", () => {
    const values = [0, 0.99];
    expect(rollTraits(() => values.shift()!)).toEqual({ A: TRAIT_ORDER[0], B: TRAIT_ORDER[TRAIT_ORDER.length - 1] });
    const seen = new Set(Array.from({ length: TRAIT_ORDER.length }, (_, i) => rollTraits(() => (i + 0.5) / TRAIT_ORDER.length).A));
    expect(seen.size).toBe(TRAIT_ORDER.length);
    expect(rollTraits(() => 1 - Number.EPSILON).A).toBe(TRAIT_ORDER[TRAIT_ORDER.length - 1]);
  });
});

/** Small deterministic PRNG so the balance check gives the same answer every run. */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Two identical bots duel to the end; one of them has `trait`. */
function botDuel(trait: TraitId, side: PlayerSlot, seed: number) {
  const random = seeded(seed);
  const engine = new DuelEngine(0, C, random, { [side]: trait });
  const bots = (["A", "B"] as const).map((slot) => [slot, new DuelBot(slot, TRAINING_DUMMY, random)] as const);
  for (let now = 0; ; now += 50) {
    const state = engine.snapshot(now);
    if (state.phase === "finished") return state.winner;
    for (const [slot, bot] of bots) {
      const spell = bot.decide(state, now);
      if (spell && !castBlocker(state, slot, spell, now)) engine.cast(slot, spell, now);
      if (bot.wantsPush(state, now)) engine.push(slot, now);
    }
  }
}

describe("trait balance", () => {
  it("every trait is an edge, and none is a runaway", { timeout: 60_000 }, () => {
    const duels = 400;
    const winRates = TRAIT_ORDER.map((trait) => {
      let wins = 0;
      for (let i = 0; i < duels; i++) {
        const side = i % 2 ? "A" : "B";
        if (botDuel(trait, side, i) === side) wins++;
      }
      return wins / duels;
    });
    for (const rate of winRates) expect(rate).toBeGreaterThan(0.52);
    for (const rate of winRates) expect(rate).toBeLessThan(0.7);
    expect(Math.max(...winRates) - Math.min(...winRates)).toBeLessThan(0.12);
  });
});
