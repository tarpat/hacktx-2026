import type { MatchState, PlayerSlot, SpellId } from "./types.js";

export interface BotOptions {
  /** Chance (0 to 1) that the bot notices an incoming spell in time to shield. */
  reflexes: number;
  /** Minimum and maximum delay between attack decisions. */
  thinkMs: [number, number];
  /** How fast the bot pushes in a spell struggle. */
  pushesPerSec: number;
}

export const TRAINING_DUMMY: BotOptions = { reflexes: 0.4, thinkMs: [1_300, 2_800], pushesPerSec: 5 };

/** Gentler practice opponent: slower to attack and rarely shields. */
export const EASY_BOT: BotOptions = { reflexes: 0.15, thinkMs: [4_000, 7_000], pushesPerSec: 3 };

/**
 * A simple opponent for practice mode and demo fallback. Call `decide` every frame;
 * it returns a spell when the bot wants to cast.
 */
export class DuelBot {
  private nextThinkAt = 0;
  private nextPushAt = 0;
  private readonly judged = new Set<string>();

  constructor(
    private readonly slot: PlayerSlot,
    private readonly options: BotOptions = TRAINING_DUMMY,
    private readonly random: () => number = Math.random,
  ) {}

  /** Call every frame; true when the bot wants to push in the current spell struggle. */
  wantsPush(state: MatchState, now: number): boolean {
    if (!state.struggle || now < this.nextPushAt) return false;
    // ±30% jitter so the bot's rhythm looks human.
    this.nextPushAt = now + (1000 / this.options.pushesPerSec) * (0.7 + this.random() * 0.6);
    return true;
  }

  decide(state: MatchState, now: number): SpellId | null {
    if (state.phase !== "active" && state.phase !== "suddenDeath") return null;
    const me = state.players[this.slot];

    for (const projectile of state.projectiles) {
      if (projectile.owner === this.slot || this.judged.has(projectile.id)) continue;
      const untilHit = projectile.arrivesAt - now;
      if (untilHit > 450) continue;
      this.judged.add(projectile.id);
      if (now >= me.readyAt.shield && this.random() < this.options.reflexes) return "shield";
    }

    if (now < this.nextThinkAt || now < me.frozenUntil) return null;
    const [min, max] = this.options.thinkMs;
    this.nextThinkAt = now + min + this.random() * (max - min);
    if (me.ultimate >= 100) return "ultimate";
    // A raised shield invites the bull.
    const rival = state.players[this.slot === "A" ? "B" : "A"];
    if (rival.shieldUntil > now && now >= me.readyAt.taurus) return "taurus";
    const options = (["fireball", "fireball", "ice", "taurus"] as SpellId[]).filter((spell) => now >= me.readyAt[spell]);
    return options.length ? options[Math.floor(this.random() * options.length)] : null;
  }
}
