import { describe, expect, it } from "vitest";
import { DEFAULT_MATCH_CONFIG as C, DuelEngine, type GameEvent } from "../src/index.js";

const START = 10_000;
const LIVE = START + C.countdownMs;

function liveEngine() {
  const engine = new DuelEngine(START, C, () => 0.1);
  engine.tick(LIVE);
  engine.drainEvents();
  return engine;
}

const types = (events: GameEvent[]) => events.map((event) => event.type);

describe("phases", () => {
  it("counts down, then runs the round clock", () => {
    const engine = new DuelEngine(START);
    expect(engine.snapshot(START).phase).toBe("countdown");
    expect(engine.cast("A", "fireball", START + 100)).toEqual({ ok: false, reason: "not_active" });
    const live = engine.snapshot(LIVE);
    expect(live.phase).toBe("active");
    expect(live.phaseEndsAt).toBe(LIVE + C.roundMs);
  });

  it("awards the round to higher HP when time runs out", () => {
    const engine = liveEngine();
    engine.cast("A", "fireball", LIVE);
    const end = engine.snapshot(LIVE + C.roundMs);
    expect(end.phase).toBe("finished");
    expect(end.winner).toBe("A");
    expect(end.endReason).toBe("time");
  });

  it("goes to sudden death on a tie, and the next hit wins", () => {
    const engine = liveEngine();
    const suddenDeath = LIVE + C.roundMs;
    expect(engine.snapshot(suddenDeath).phase).toBe("suddenDeath");
    engine.cast("B", "ice", suddenDeath + 10);
    const end = engine.snapshot(suddenDeath + 10 + C.spells.ice.travelMs);
    expect(end.winner).toBe("B");
    expect(end.endReason).toBe("suddenDeath");
  });

  it("declares a draw if sudden death also times out", () => {
    const engine = liveEngine();
    const end = engine.snapshot(LIVE + C.roundMs + C.suddenDeathMs);
    expect(end.winner).toBeNull();
    expect(end.endReason).toBe("draw");
  });
});

describe("combat", () => {
  it("lands a fireball after its travel time", () => {
    const engine = liveEngine();
    expect(engine.cast("A", "fireball", LIVE)).toEqual({ ok: true });
    expect(engine.snapshot(LIVE + C.spells.fireball.travelMs - 1).players.B.hp).toBe(100);
    expect(engine.snapshot(LIVE + C.spells.fireball.travelMs).players.B.hp).toBe(80);
  });

  it("enforces cooldowns", () => {
    const engine = liveEngine();
    engine.cast("A", "fireball", LIVE);
    expect(engine.cast("A", "fireball", LIVE + 100)).toEqual({ ok: false, reason: "cooldown" });
    expect(engine.cast("A", "fireball", LIVE + C.spells.fireball.cooldownMs)).toEqual({ ok: true });
  });

  it("blocks with a timely shield, which shatters and charges the defender's ultimate", () => {
    const engine = liveEngine();
    engine.cast("A", "fireball", LIVE);
    engine.cast("B", "shield", LIVE + 500);
    const state = engine.snapshot(LIVE + C.spells.fireball.travelMs);
    expect(state.players.B.hp).toBe(100);
    expect(state.players.B.ultimate).toBe(C.ultimateGain.perBlock);
    expect(types(engine.drainEvents())).toContain("SPELL_BLOCKED");
  });

  it("does not block when the shield is raised too early", () => {
    const engine = liveEngine();
    engine.cast("B", "shield", LIVE);
    engine.cast("A", "fireball", LIVE + 100);
    expect(engine.snapshot(LIVE + 100 + C.spells.fireball.travelMs).players.B.hp).toBe(80);
  });

  it("freezes attacks after an ice hit but still allows shielding", () => {
    const engine = liveEngine();
    engine.cast("A", "ice", LIVE);
    const hit = LIVE + C.spells.ice.travelMs;
    engine.tick(hit);
    expect(engine.cast("B", "fireball", hit + 100)).toEqual({ ok: false, reason: "frozen" });
    expect(engine.cast("B", "shield", hit + 100)).toEqual({ ok: true });
    expect(engine.cast("B", "fireball", hit + C.freezeMs)).toEqual({ ok: true });
  });

  it("knocks out at zero HP", () => {
    const engine = liveEngine();
    let now = LIVE;
    while (engine.phase !== "finished") {
      engine.cast("A", "fireball", now);
      now += C.spells.fireball.cooldownMs;
      engine.tick(now);
    }
    const end = engine.snapshot(now);
    expect(end.players.B.hp).toBe(0);
    expect(end.winner).toBe("A");
    expect(end.endReason).toBe("knockout");
  });
});

describe("ultimate", () => {
  it("is gated by the meter and resets it", () => {
    const engine = liveEngine();
    expect(engine.cast("A", "ultimate", LIVE)).toEqual({ ok: false, reason: "meter" });
    let now = LIVE;
    while (engine.snapshot(now).players.A.ultimate < C.ultimateMax) {
      engine.cast("A", "fireball", now);
      now += C.spells.fireball.cooldownMs;
    }
    expect(types(engine.drainEvents())).toContain("ULTIMATE_READY");
    expect(engine.cast("A", "ultimate", now)).toEqual({ ok: true });
    expect(engine.snapshot(now).players.A.ultimate).toBe(0);
  });

  it("breaks through a shield at reduced damage", () => {
    const engine = liveEngine();
    let now = LIVE;
    while (engine.snapshot(now).players.A.ultimate < C.ultimateMax) {
      engine.cast("A", "fireball", now);
      now += C.spells.fireball.cooldownMs;
    }
    const hpBefore = engine.snapshot(now).players.B.hp;
    engine.cast("A", "ultimate", now);
    engine.cast("B", "shield", now + C.spells.ultimate.travelMs - 200);
    const after = engine.snapshot(now + C.spells.ultimate.travelMs).players.B.hp;
    expect(hpBefore - after).toBe(C.spells.ultimate.damage * C.ultimateShieldFactor);
  });

  it("strikes from the sky, so bolts cast at it never clash", () => {
    const engine = liveEngine();
    let now = LIVE;
    while (engine.snapshot(now).players.A.ultimate < C.ultimateMax) {
      engine.cast("A", "fireball", now);
      now += C.spells.fireball.cooldownMs;
    }
    engine.drainEvents();
    engine.cast("A", "ultimate", now);
    engine.cast("B", "fireball", now + 100);
    engine.tick(now + 3_000);
    const events = engine.drainEvents();
    expect(types(events)).not.toContain("SPELL_CLASH");
    const hits = events.flatMap((event) => (event.type === "DAMAGE_APPLIED" ? [event.spell] : []));
    expect(hits).toEqual(expect.arrayContaining(["ultimate", "fireball"]));
  });
});

describe("taurus", () => {
  it("shatters a raised shield and lands the full hit", () => {
    const engine = liveEngine();
    engine.cast("A", "taurus", LIVE);
    engine.cast("B", "shield", LIVE + C.spells.taurus.travelMs - 200);
    engine.tick(LIVE + C.spells.taurus.travelMs);
    const events = engine.drainEvents();
    expect(types(events)).toContain("SHIELD_SHATTERED");
    expect(types(events)).not.toContain("SPELL_BLOCKED");
    const state = engine.snapshot(LIVE + C.spells.taurus.travelMs);
    expect(state.players.B.hp).toBe(100 - C.spells.taurus.damage);
    expect(state.players.B.shieldUntil).toBeLessThanOrEqual(LIVE + C.spells.taurus.travelMs);
    expect(state.players.B.stats.blocks).toBe(0);
  });

  it("runs under spells in the air, so nothing clashes with it", () => {
    const engine = liveEngine();
    engine.cast("A", "taurus", LIVE);
    engine.cast("B", "fireball", LIVE + 100);
    engine.tick(LIVE + 2_000);
    const events = engine.drainEvents();
    expect(types(events)).not.toContain("SPELL_CLASH");
    const hits = events.flatMap((event) => (event.type === "DAMAGE_APPLIED" ? [event.spell] : []));
    expect(hits).toEqual(["taurus", "fireball"]);
  });
});

describe("clash", () => {
  it("lets the stronger spell push through with the difference", () => {
    const engine = liveEngine();
    engine.cast("A", "fireball", LIVE);
    engine.cast("B", "ice", LIVE + 100);
    const events = engine.drainEvents();
    engine.tick(LIVE + 2_000);
    const later = engine.drainEvents();
    const clash = later.find((event) => event.type === "SPELL_CLASH");
    expect(types(events)).not.toContain("SPELL_CLASH");
    expect(clash && clash.type === "SPELL_CLASH" && clash.winner).toBe("A");
    const state = engine.snapshot(LIVE + 2_000);
    expect(state.players.B.hp).toBe(100 - (C.spells.fireball.damage - C.spells.ice.damage));
    expect(state.players.A.hp).toBe(100);
    expect(state.players.A.frozenUntil).toBe(0);
  });

  it("fizzles equal spells", () => {
    const engine = liveEngine();
    engine.cast("A", "fireball", LIVE);
    engine.cast("B", "fireball", LIVE + 200);
    const state = engine.snapshot(LIVE + 2_000);
    expect(state.players.A.hp).toBe(100);
    expect(state.players.B.hp).toBe(100);
  });

  it("does not clash outside the window", () => {
    const engine = liveEngine();
    engine.cast("A", "fireball", LIVE);
    engine.cast("B", "fireball", LIVE + C.clashWindowMs + 50);
    const state = engine.snapshot(LIVE + 3_000);
    expect(state.players.A.hp).toBe(80);
    expect(state.players.B.hp).toBe(80);
  });
});

describe("power-ups", () => {
  it("empower boosts only the next attack", () => {
    const engine = liveEngine();
    engine.grantPowerUp("A", "empower", LIVE);
    engine.cast("A", "fireball", LIVE);
    engine.cast("A", "ice", LIVE + 1_500);
    const state = engine.snapshot(LIVE + 3_000);
    expect(state.players.B.hp).toBe(100 - C.spells.fireball.damage * C.empowerMultiplier - C.spells.ice.damage);
  });

  it("haste shortens current and new cooldowns", () => {
    const engine = liveEngine();
    engine.cast("A", "fireball", LIVE);
    engine.grantPowerUp("A", "haste", LIVE);
    const shortened = LIVE + C.spells.fireball.cooldownMs * C.hasteCooldownFactor;
    expect(engine.cast("A", "fireball", shortened)).toEqual({ ok: true });
  });

  it("heal restores HP without exceeding the maximum", () => {
    const engine = liveEngine();
    engine.grantPowerUp("B", "heal", LIVE);
    expect(engine.snapshot(LIVE).players.B.hp).toBe(100);
    engine.cast("A", "fireball", LIVE);
    const later = LIVE + C.powerUpCooldownMs;
    engine.tick(later);
    engine.grantPowerUp("B", "heal", later);
    expect(engine.snapshot(later).players.B.hp).toBe(80 + C.healAmount);
  });

  it("allows one power-up per cooldown window", () => {
    const engine = liveEngine();
    expect(engine.grantPowerUp("A", "heal", LIVE)).toBe(true);
    expect(engine.grantPowerUp("A", "empower", LIVE + 1_000)).toBe(false);
    expect(engine.grantPowerUp("B", "empower", LIVE + 1_000)).toBe(true);
    expect(engine.grantPowerUp("A", "empower", LIVE + C.powerUpCooldownMs)).toBe(true);
  });
});
