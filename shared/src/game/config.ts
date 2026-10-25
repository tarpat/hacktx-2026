import type { PowerUpId, SpellId, TraitId } from "./types.js";

export interface SpellConfig {
  id: SpellId;
  name: string;
  incantation: string;
  /** Damage dealt on hit. Zero for defensive spells. */
  damage: number;
  /** Milliseconds before the spell can be cast again. Fulmen is gated by the meter instead. */
  cooldownMs: number;
  /** Milliseconds a projectile takes to cross the arena. */
  travelMs: number;
  offensive: boolean;
  /** Damage is multiplied by the cast's charge power (0–1), floored at `minPowerFactor`. */
  charged?: boolean;
}

export interface PowerUpConfig {
  id: PowerUpId;
  name: string;
  /** How long the effect lasts. Zero for instant effects. */
  durationMs: number;
}

export interface TraitConfig {
  id: TraitId;
  name: string;
  /** One line for the HUD. Keep it in step with `factor`. */
  effect: string;
  /** Strength: a multiplier on the one stat the trait changes, or for Siphon the share of damage healed (see `DuelEngine`). */
  factor: number;
}

export interface StruggleConfig {
  /** How long the tug-of-war lasts before whoever is ahead wins. */
  durationMs: number;
  /** Balance moved by one push (balance runs from -1 to +1). */
  pushStep: number;
  /** Pushes closer together than this are ignored, so no input can count twice or be spammed by a script. */
  minPushGapMs: number;
  /** At time-out, a lead smaller than this is a draw and both spells fizzle. */
  drawMargin: number;
  /** The winning spell flies on this much faster than normal. */
  speedFactor: number;
}

export interface MatchConfig {
  maxHp: number;
  countdownMs: number;
  roundMs: number;
  suddenDeathMs: number;
  shieldGuardMs: number;
  freezeMs: number;
  /** Fulmen damage multiplier when it hits a raised shield. */
  ultimateShieldFactor: number;
  /** Opposing attacks launched within this window collide mid-arena. */
  clashWindowMs: number;
  /** Same-spell clash tug-of-war. */
  struggle: StruggleConfig;
  ultimateMax: number;
  ultimateGain: { perDamageDealt: number; perBlock: number; perDamageTaken: number };
  empowerMultiplier: number;
  hasteCooldownFactor: number;
  healAmount: number;
  /** One incantation power-up per player per this many milliseconds. */
  powerUpCooldownMs: number;
  spells: Record<SpellId, SpellConfig>;
  powerUps: Record<PowerUpId, PowerUpConfig>;
  traits: Record<TraitId, TraitConfig>;
}

export const SPELL_ORDER: SpellId[] = ["fireball", "shield", "ice", "taurus", "ultimate"];
export const TRAIT_ORDER: TraitId[] = ["ironhide", "pyromancer", "frostbite", "stormcaller", "siphon", "stampede"];

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  maxHp: 100,
  countdownMs: 3_000,
  roundMs: 60_000,
  suddenDeathMs: 15_000,
  shieldGuardMs: 1_200,
  freezeMs: 1_200,
  ultimateShieldFactor: 0.5,
  clashWindowMs: 500,
  struggle: { durationMs: 6_700, pushStep: 0.07, minPushGapMs: 60, drawMargin: 0.1, speedFactor: 0.7 },
  ultimateMax: 100,
  ultimateGain: { perDamageDealt: 1.25, perBlock: 25, perDamageTaken: 0.5 },
  empowerMultiplier: 1.5,
  hasteCooldownFactor: 0.6,
  healAmount: 15,
  powerUpCooldownMs: 12_000,
  spells: {
    // Short enough that Incendio is back by the time a gesture caster has thrown the other spells.
    fireball: { id: "fireball", name: "Incendio", incantation: "Incendio!", damage: 20, cooldownMs: 2_500, travelMs: 1_600, offensive: true },
    shield: { id: "shield", name: "Protego", incantation: "Protego!", damage: 0, cooldownMs: 3_000, travelMs: 0, offensive: false },
    ice: { id: "ice", name: "Glacius", incantation: "Glacius!", damage: 10, cooldownMs: 5_000, travelMs: 1_300, offensive: true },
    ultimate: { id: "ultimate", name: "Fulmen", incantation: "Fulmen!", damage: 30, cooldownMs: 0, travelMs: 1_900, offensive: true },
    taurus: { id: "taurus", name: "Taurus", incantation: "Hook 'em!", damage: 15, cooldownMs: 4_000, travelMs: 1_700, offensive: true },
  },
  powerUps: {
    empower: { id: "empower", name: "Empowered", durationMs: 8_000 },
    haste: { id: "haste", name: "Haste", durationMs: 6_000 },
    heal: { id: "heal", name: "Healing Draught", durationMs: 0 },
  },
  // Tuned so each wins about 56–63% of bot-vs-bot duels against no trait; shared/test/traits.test.ts keeps them in a band.
  traits: {
    ironhide: { id: "ironhide", name: "Ironhide", effect: "+10% max health", factor: 1.1 },
    pyromancer: { id: "pyromancer", name: "Pyromancer", effect: "Incendio hits 25% harder", factor: 1.25 },
    frostbite: { id: "frostbite", name: "Frostbite", effect: "Glacius freezes 2.5× as long", factor: 2.5 },
    stormcaller: { id: "stormcaller", name: "Stormcaller", effect: "Fulmen charges 50% faster", factor: 1.5 },
    siphon: { id: "siphon", name: "Siphon", effect: "Heal 10% of the damage you deal", factor: 0.1 },
    stampede: { id: "stampede", name: "Stampede", effect: "Taurus hits 25% harder", factor: 1.25 },
  },
};

export function makeMatchConfig(overrides: Partial<MatchConfig> = {}): MatchConfig {
  return { ...DEFAULT_MATCH_CONFIG, ...overrides };
}
