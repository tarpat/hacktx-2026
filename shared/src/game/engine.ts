import { DEFAULT_MATCH_CONFIG, type MatchConfig } from "./config.js";
import type { CastResult, EndReason, GameEvent, MatchState, PlayerSlot, PlayerState, PowerUpId, Projectile, SpellId, Struggle } from "./types.js";

type EventPayload = GameEvent extends infer E ? (E extends GameEvent ? Omit<E, "id" | "at"> : never) : never;

interface ClashPlan {
  at: number;
  ids: [string, string];
}

export const opponentOf = (slot: PlayerSlot): PlayerSlot => (slot === "A" ? "B" : "A");

const isLive = (state: MatchState) => state.phase === "active" || state.phase === "suddenDeath";

function createPlayer(slot: PlayerSlot, config: MatchConfig): PlayerState {
  return {
    slot,
    hp: config.maxHp,
    maxHp: config.maxHp,
    ultimate: 0,
    readyAt: { fireball: 0, shield: 0, ice: 0, ultimate: 0, sixSeven: 0 },
    shieldUntil: 0,
    frozenUntil: 0,
    empoweredUntil: 0,
    hasteUntil: 0,
    powerUpReadyAt: 0,
    stats: { casts: 0, hits: 0, blocks: 0, damageDealt: 0, clashesWon: 0 },
  };
}

/**
 * Deterministic duel rules. Every method takes the current time so the same engine runs
 * authoritatively on the server and locally in practice mode.
 */
export class DuelEngine {
  readonly config: MatchConfig;
  private readonly state: MatchState;
  private events: GameEvent[] = [];
  private eventSeq = 0;
  private projectileSeq = 0;
  private clashes: ClashPlan[] = [];

  constructor(now: number, config: MatchConfig = DEFAULT_MATCH_CONFIG, random: () => number = Math.random) {
    this.config = config;
    this.state = {
      phase: "countdown",
      now,
      phaseEndsAt: now + config.countdownMs,
      roundMs: config.roundMs,
      players: { A: createPlayer("A", config), B: createPlayer("B", config) },
      projectiles: [],
      struggle: null,
      winner: null,
      endReason: null,
      loserForm: random() < 0.5 ? "frog" : "teapot",
    };
  }

  /** A deep copy that is safe to serialize or hand to rendering code. */
  snapshot(now: number): MatchState {
    this.tick(now);
    return JSON.parse(JSON.stringify({ ...this.state, now })) as MatchState;
  }

  drainEvents(): GameEvent[] {
    const drained = this.events;
    this.events = [];
    return drained;
  }

  get phase() {
    return this.state.phase;
  }

  /** `power` (0–1) only matters for charged spells; a weak charge still deals a quarter of full damage. */
  cast(slot: PlayerSlot, spell: SpellId, now: number, power = 1): CastResult {
    this.tick(now);
    const spellConfig = this.config.spells[spell];
    if (!spellConfig) return { ok: false, reason: "unknown" };
    const reject = (reason: Exclude<CastResult, { ok: true }>["reason"]): CastResult => {
      this.emit(now, { type: "CAST_REJECTED", slot, spell, reason });
      return { ok: false, reason };
    };
    if (!isLive(this.state)) return reject("not_active");
    const player = this.state.players[slot];
    if (spellConfig.offensive && now < player.frozenUntil) return reject("frozen");
    if (spell === "ultimate" ? player.ultimate < this.config.ultimateMax : now < player.readyAt[spell]) {
      return reject(spell === "ultimate" ? "meter" : "cooldown");
    }

    player.stats.casts += 1;
    player.readyAt[spell] = now + this.cooldownFor(player, spell, now);

    if (!spellConfig.offensive) {
      player.shieldUntil = now + this.config.shieldGuardMs;
      this.emit(now, { type: "SPELL_CAST", slot, spell, projectileId: null, empowered: false });
      return { ok: true };
    }

    const empowered = now < player.empoweredUntil;
    if (empowered) player.empoweredUntil = 0;
    if (spell === "ultimate") player.ultimate = 0;
    const projectile: Projectile = {
      id: `${slot}${++this.projectileSeq}`,
      owner: slot,
      spell,
      damage: Math.round(
        spellConfig.damage * (empowered ? this.config.empowerMultiplier : 1) * (spellConfig.charged ? Math.min(1, Math.max(0.25, power)) : 1),
      ),
      empowered,
      launchedAt: now,
      arrivesAt: now + spellConfig.travelMs,
    };
    this.planClash(projectile);
    this.state.projectiles.push(projectile);
    this.emit(now, { type: "SPELL_CAST", slot, spell, projectileId: projectile.id, empowered });
    return { ok: true };
  }

  grantPowerUp(slot: PlayerSlot, powerUp: PowerUpId, now: number): boolean {
    this.tick(now);
    const player = this.state.players[slot];
    if (!isLive(this.state) || now < player.powerUpReadyAt) return false;
    player.powerUpReadyAt = now + this.config.powerUpCooldownMs;
    const { durationMs } = this.config.powerUps[powerUp];
    if (powerUp === "empower") player.empoweredUntil = now + durationMs;
    if (powerUp === "heal") player.hp = Math.min(player.maxHp, player.hp + this.config.healAmount);
    if (powerUp === "haste") {
      player.hasteUntil = now + durationMs;
      for (const spell of Object.keys(player.readyAt) as SpellId[]) {
        const remaining = player.readyAt[spell] - now;
        if (remaining > 0) player.readyAt[spell] = now + remaining * this.config.hasteCooldownFactor;
      }
    }
    this.emit(now, { type: "POWER_UP", slot, powerUp });
    return true;
  }

  /**
   * One push in a same-spell clash. Returns false when there is no clash to push or the push
   * came too soon after the last one (input can't double-count, and scripts can't spam).
   */
  push(slot: PlayerSlot, now: number): boolean {
    this.tick(now);
    const struggle = this.state.struggle;
    if (!struggle || !isLive(this.state)) return false;
    const { pushStep, minPushGapMs } = this.config.struggle;
    if (now - struggle.lastPushAt[slot] < minPushGapMs) return false;
    struggle.lastPushAt[slot] = now;
    struggle.pushes[slot] += 1;
    struggle.balance = Math.max(-1, Math.min(1, struggle.balance + (slot === "A" ? pushStep : -pushStep)));
    if (Math.abs(struggle.balance) >= 1) this.endStruggle(now);
    return true;
  }

  /** Advances the match to `now`, resolving phase changes, clashes and hits in time order. */
  tick(now: number): void {
    for (;;) {
      const { phase, phaseEndsAt } = this.state;
      if (phase === "finished") return;
      if (phase === "countdown") {
        if (now < phaseEndsAt) return;
        this.state.phase = "active";
        this.state.phaseEndsAt = phaseEndsAt + this.config.roundMs;
        this.emit(phaseEndsAt, { type: "PHASE_CHANGED", phase: "active" });
        continue;
      }

      const clash = this.clashes.reduce<ClashPlan | null>((first, plan) => (!first || plan.at < first.at ? plan : first), null);
      const arrival = this.state.projectiles.reduce<Projectile | null>((first, p) => (!first || p.arrivesAt < first.arrivesAt ? p : first), null);
      const struggleEndsAt = this.state.struggle?.endsAt ?? Infinity;
      const nextAt = Math.min(clash?.at ?? Infinity, arrival?.arrivesAt ?? Infinity, struggleEndsAt, phaseEndsAt);
      if (nextAt > now) return;

      if (struggleEndsAt === nextAt) this.endStruggle(nextAt);
      else if (clash && clash.at === nextAt) this.resolveClash(clash);
      else if (arrival && arrival.arrivesAt === nextAt) this.resolveArrival(arrival);
      else this.endPhase(phaseEndsAt);
    }
  }

  private cooldownFor(player: PlayerState, spell: SpellId, now: number): number {
    const base = this.config.spells[spell].cooldownMs;
    return now < player.hasteUntil ? base * this.config.hasteCooldownFactor : base;
  }

  private planClash(incoming: Projectile): void {
    const travel = this.config.spells[incoming.spell].travelMs;
    const rival = this.state.projectiles.find(
      (p) =>
        p.owner !== incoming.owner &&
        incoming.launchedAt - p.launchedAt <= this.config.clashWindowMs &&
        !this.clashes.some((plan) => plan.ids.includes(p.id)),
    );
    if (!rival) return;
    // Each projectile covers its fraction of the arena; they meet when the fractions sum to one.
    const rivalTravel = this.config.spells[rival.spell].travelMs;
    const at = (1 + rival.launchedAt / rivalTravel + incoming.launchedAt / travel) / (1 / rivalTravel + 1 / travel);
    if (at < rival.arrivesAt) this.clashes.push({ at, ids: [rival.id, incoming.id] });
  }

  private resolveClash(plan: ClashPlan): void {
    this.clashes = this.clashes.filter((entry) => entry !== plan);
    const [first, second] = plan.ids.map((id) => this.state.projectiles.find((p) => p.id === id));
    if (!first || !second) return;
    if (first.spell === second.spell && !this.state.struggle) return this.startStruggle(first, second, plan.at);
    const survivor = first.damage === second.damage ? null : first.damage > second.damage ? first : second;
    const loser = survivor === first ? second : first;
    const fizzled = survivor ? [loser] : [first, second];
    if (survivor) {
      survivor.damage -= loser.damage;
      this.state.players[survivor.owner].stats.clashesWon += 1;
    }
    this.state.projectiles = this.state.projectiles.filter((p) => !fizzled.includes(p));
    this.emit(plan.at, { type: "SPELL_CLASH", winner: survivor?.owner ?? null, survivorId: survivor?.id ?? null, fizzledIds: fizzled.map((p) => p.id) });
  }

  private startStruggle(first: Projectile, second: Projectile, at: number): void {
    const byOwner = { [first.owner]: first, [second.owner]: second } as Record<PlayerSlot, Projectile>;
    const meetAt = Math.min(1, Math.max(0, (at - byOwner.A.launchedAt) / (byOwner.A.arrivesAt - byOwner.A.launchedAt)));
    // The locked spells leave the projectile list; the struggle owns them until it resolves.
    this.state.projectiles = this.state.projectiles.filter((p) => p !== first && p !== second);
    this.clashes = this.clashes.filter((plan) => !plan.ids.includes(first.id) && !plan.ids.includes(second.id));
    const struggle: Struggle = {
      spell: first.spell,
      projectiles: byOwner,
      startedAt: at,
      endsAt: at + this.config.struggle.durationMs,
      meetAt,
      balance: 0,
      pushes: { A: 0, B: 0 },
      // Zero rather than -Infinity: the state is sent as JSON, where -Infinity becomes null.
      lastPushAt: { A: 0, B: 0 },
    };
    this.state.struggle = struggle;
    this.emit(at, { type: "STRUGGLE_START", spell: struggle.spell, endsAt: struggle.endsAt });
  }

  /** Where the locked spells are now, 0 = A's side, 1 = B's side. */
  static strugglePosition(struggle: Struggle): number {
    const { meetAt, balance } = struggle;
    return balance >= 0 ? meetAt + (1 - meetAt) * balance : meetAt + meetAt * balance;
  }

  private endStruggle(at: number): void {
    const struggle = this.state.struggle;
    if (!struggle) return;
    this.state.struggle = null;
    const { drawMargin, speedFactor } = this.config.struggle;
    const { A, B } = struggle.projectiles;
    if (Math.abs(struggle.balance) < drawMargin) {
      this.emit(at, { type: "SPELL_CLASH", winner: null, survivorId: null, fizzledIds: [A.id, B.id] });
      return;
    }
    const winner: PlayerSlot = struggle.balance > 0 ? "A" : "B";
    const survivor = struggle.projectiles[winner];
    const loser = struggle.projectiles[opponentOf(winner)];
    // The winner's spell swallows the loser's and races on from wherever the clash was shoved to.
    const position = DuelEngine.strugglePosition(struggle);
    const covered = Math.min(0.95, winner === "A" ? position : 1 - position);
    const travel = this.config.spells[survivor.spell].travelMs * speedFactor;
    this.state.projectiles.push({
      ...survivor,
      damage: survivor.damage + loser.damage,
      empowered: true,
      launchedAt: at - covered * travel,
      arrivesAt: at + (1 - covered) * travel,
    });
    this.state.players[winner].stats.clashesWon += 1;
    this.emit(at, { type: "SPELL_CLASH", winner, survivorId: survivor.id, fizzledIds: [loser.id] });
  }

  private resolveArrival(projectile: Projectile): void {
    const at = projectile.arrivesAt;
    this.state.projectiles = this.state.projectiles.filter((p) => p !== projectile);
    const defender = this.state.players[opponentOf(projectile.owner)];
    let damage = projectile.damage;

    if (defender.shieldUntil > at) {
      damage = projectile.spell === "ultimate" ? Math.round(damage * this.config.ultimateShieldFactor) : 0;
      defender.shieldUntil = at;
      defender.stats.blocks += 1;
      this.chargeUltimate(defender, this.config.ultimateGain.perBlock, at);
      this.emit(at, { type: "SPELL_BLOCKED", defender: defender.slot, spell: projectile.spell, damage });
      if (damage === 0) return;
    }

    this.applyDamage(projectile, defender, damage, at);
    if (projectile.spell === "ice" && this.state.phase !== "finished") {
      defender.frozenUntil = at + this.config.freezeMs;
      this.emit(at, { type: "FROZEN", slot: defender.slot, until: defender.frozenUntil });
    }
  }

  private applyDamage(projectile: Projectile, defender: PlayerState, damage: number, at: number): void {
    const attacker = this.state.players[projectile.owner];
    defender.hp = Math.max(0, defender.hp - damage);
    attacker.stats.hits += 1;
    attacker.stats.damageDealt += damage;
    this.emit(at, { type: "DAMAGE_APPLIED", target: defender.slot, spell: projectile.spell, amount: damage, hp: defender.hp });
    this.chargeUltimate(attacker, damage * this.config.ultimateGain.perDamageDealt, at);
    this.chargeUltimate(defender, damage * this.config.ultimateGain.perDamageTaken, at);
    if (defender.hp === 0) this.finish(attacker.slot, "knockout", at);
    else if (this.state.phase === "suddenDeath") this.finish(attacker.slot, "suddenDeath", at);
  }

  private chargeUltimate(player: PlayerState, amount: number, at: number): void {
    const max = this.config.ultimateMax;
    if (player.ultimate >= max) return;
    player.ultimate = Math.min(max, player.ultimate + amount);
    if (player.ultimate >= max) this.emit(at, { type: "ULTIMATE_READY", slot: player.slot });
  }

  private endPhase(at: number): void {
    const { A, B } = this.state.players;
    if (A.hp !== B.hp) return this.finish(A.hp > B.hp ? "A" : "B", "time", at);
    if (this.state.phase === "suddenDeath") return this.finish(null, "draw", at);
    this.state.phase = "suddenDeath";
    this.state.phaseEndsAt = at + this.config.suddenDeathMs;
    this.emit(at, { type: "PHASE_CHANGED", phase: "suddenDeath" });
  }

  private finish(winner: PlayerSlot | null, reason: EndReason, at: number): void {
    this.state.phase = "finished";
    this.state.phaseEndsAt = 0;
    this.state.winner = winner;
    this.state.endReason = reason;
    this.state.projectiles = [];
    this.state.struggle = null;
    this.clashes = [];
    this.emit(at, { type: "PHASE_CHANGED", phase: "finished" });
    this.emit(at, { type: "MATCH_END", winner, reason });
  }

  private emit(at: number, event: EventPayload): void {
    this.events.push({ ...event, id: ++this.eventSeq, at } as GameEvent);
  }
}
