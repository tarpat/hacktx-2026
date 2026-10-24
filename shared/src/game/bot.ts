import type { MatchState, PlayerSlot, SpellId } from "./types.js";

export interface BotOptions {
  /** Chance (0 to 1) that the bot notices an incoming spell in time to shield. */
  reflexes: number;
  /** Minimum and maximum delay between attack decisions. */
  thinkMs: [number, number];
}

export const TRAINING_DUMMY: BotOptions = { reflexes: 0.4, thinkMs: [1_300, 2_800] };

/** Gentler practice opponent: slower to attack and rarely shields. */
export const EASY_BOT: BotOptions = { reflexes: 0.15, thinkMs: [4_000, 7_000] };

/**
 * A simple opponent for practice mode and demo fallback. Call `decide` every frame;
 * it returns a spell when the bot wants to cast.
 */
export class DuelBot {
  private nextThinkAt = 0;
  private readonly judged = new Set<string>();

  constructor(
    private readonly slot: PlayerSlot,
    private readonly options: BotOptions = TRAINING_DUMMY,
    private readonly random: () => number = Math.random,
  ) {}

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
    const options = (["fireball", "fireball", "ice"] as SpellId[]).filter((spell) => now >= me.readyAt[spell]);
    return options.length ? options[Math.floor(this.random() * options.length)] : null;
  }
}
