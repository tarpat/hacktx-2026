import { describe, expect, it } from "vitest";
import { DEFAULT_MATCH_CONFIG as C, DuelEngine, POSE_RACE, POSE_SEQUENCE, type PlayerSlot } from "../src/index.js";

const LIVE = 13_000;
function race(random = 0.8, extraProjectile = false) {
  const engine = new DuelEngine(10_000, C, () => random);
  engine.cast("A", "fireball", LIVE);
  engine.cast("B", "fireball", LIVE);
  if (extraProjectile) engine.cast("A", "taurus", LIVE + 100);
  const state = engine.snapshot(LIVE + 800);
  const struggle = state.struggle!;
  if (struggle.kind !== "pose") return { engine, struggle, ready: 0, id: "" };
  return { engine, struggle, ready: struggle.poseRace.readyAt, id: struggle.poseRace.id };
}

describe("collision pose race", () => {
  it("uses the injected coin flip at the 50/50 boundary", () => {
    expect(race(0.49999).struggle.kind).toBe("pump");
    expect(race(0.5).struggle.kind).toBe("pose");
    expect(POSE_SEQUENCE.map((p) => p.id)).toEqual(["think", "tongue", "think-again", "gasp", "grin"]);
  });

  it("requires neutral, a sustained hold, and all five poses before either player wins", () => {
    const { engine, ready, id } = race();
    let now = ready;
    const sample = (step: number, matched: boolean | null, slot: PlayerSlot = "B") => engine.poseSample(slot, { struggleId: id, step, matched }, now);
    expect(engine.push("B", now)).toBe(false);
    expect(engine.cast("A", "ice", now)).toEqual({ ok: false, reason: "clash" });
    expect(engine.grantPowerUp("A", "heal", now)).toBe(false);
    // Holding before releasing cannot earn a step, even well beyond the hold duration.
    for (let i = 0; i < 8; i++) { sample(0, true); now += 100; }
    for (let step = 0; step < POSE_SEQUENCE.length; step++) {
      for (let i = 0; i < 3; i++) { sample(step, false); now += 100; }
      for (let i = 0; i < 6; i++) { sample(step, true); now += 100; }
      if (step < POSE_SEQUENCE.length - 1) expect(engine.snapshot(now).struggle).not.toBeNull();
    }
    expect(engine.snapshot(now).struggle).toBeNull();
    expect(engine.drainEvents().filter((e) => e.type === "POSE_MATCHED")).toHaveLength(5);
    expect(engine.snapshot(now + 2_000).players.A.hp).toBe(60);
    expect(engine.snapshot(now + 2_000).players.B.stats.clashesWon).toBe(1);
  });

  it("rejects early, stale, skipped and malformed samples", () => {
    const { engine, ready, id } = race();
    expect(engine.poseSample("A", { struggleId: id, step: 0, matched: false }, ready - 1)).toBe(false);
    expect(engine.poseSample("A", { struggleId: "old", step: 0, matched: true }, ready)).toBe(false);
    expect(engine.poseSample("A", { struggleId: id, step: 1, matched: true }, ready)).toBe(false);
    expect(engine.poseSample("A", { struggleId: id, step: 0, matched: "yes" as unknown as boolean }, ready)).toBe(false);
    expect(engine.poseSample("A", { struggleId: id, step: 0, matched: false }, ready)).toBe(true);
    expect(engine.poseSample("A", { struggleId: id, step: 0, matched: false }, ready + 1)).toBe(false);
  });

  it("resets hold on tracking loss and gaps; a partial lead draws at timeout", () => {
    const { engine, ready, id, struggle } = race();
    const sample = (offset: number, matched: boolean | null) => engine.poseSample("A", { struggleId: id, step: 0, matched }, ready + offset);
    sample(0, false); sample(100, false); sample(200, false);
    sample(300, true); sample(500, true); sample(600, null); sample(700, true); sample(900, true);
    sample(1_500, true); sample(1_700, true);
    const state = engine.snapshot(ready + 1_700);
    expect(state.struggle?.kind === "pose" && state.struggle.poseRace.progress.A.step).toBe(0);
    sample(1_800, true); sample(1_900, true); sample(2_000, true);
    engine.tick(struggle.endsAt);
    const result = engine.drainEvents().find((e) => e.type === "SPELL_CLASH");
    expect(result && "winner" in result && result.winner).toBeNull();
    expect(engine.snapshot(struggle.endsAt).projectiles).toHaveLength(0);
  });

  it("pauses pending hits, cooldowns and round time, then resumes them", () => {
    const { engine, struggle } = race(0.8, true);
    const end = struggle.endsAt;
    expect(engine.snapshot(end - 1).players.B.hp).toBe(100);
    const resumed = engine.snapshot(end);
    const pausedMs = POSE_RACE.countdownMs + POSE_RACE.durationMs;
    expect(resumed.phaseEndsAt).toBe(LIVE + C.roundMs + pausedMs);
    expect(resumed.players.A.readyAt.fireball).toBe(LIVE + C.spells.fireball.cooldownMs + pausedMs);
    expect(resumed.projectiles[0].arrivesAt).toBe(LIVE + 100 + C.spells.taurus.travelMs + pausedMs);
    expect(engine.snapshot(resumed.projectiles[0].arrivesAt).players.B.hp).toBe(85);
  });
});
