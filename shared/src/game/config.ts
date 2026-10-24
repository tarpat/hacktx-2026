import type { PowerUpId, SpellId } from "./types.js";

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
}

export interface PowerUpConfig {
  id: PowerUpId;
  name: string;
  /** How long the effect lasts. Zero for instant effects. */
  durationMs: number;
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
  ultimateMax: number;
  ultimateGain: { perDamageDealt: number; perBlock: number; perDamageTaken: number };
  empowerMultiplier: number;
  hasteCooldownFactor: number;
  healAmount: number;
  /** One incantation power-up per player per this many milliseconds. */
  powerUpCooldownMs: number;
  spells: Record<SpellId, SpellConfig>;
  powerUps: Record<PowerUpId, PowerUpConfig>;
}

export const SPELL_ORDER: SpellId[] = ["fireball", "shield", "ice", "ultimate"];

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  maxHp: 100,
  countdownMs: 3_000,
  roundMs: 60_000,
  suddenDeathMs: 15_000,
  shieldGuardMs: 900,
  freezeMs: 1_200,
  ultimateShieldFactor: 0.5,
  clashWindowMs: 350,
  ultimateMax: 100,
  ultimateGain: { perDamageDealt: 1.25, perBlock: 25, perDamageTaken: 0.5 },
  empowerMultiplier: 1.5,
  hasteCooldownFactor: 0.6,
  healAmount: 15,
  powerUpCooldownMs: 12_000,
  spells: {
    fireball: { id: "fireball", name: "Incendio", incantation: "Incendio!", damage: 20, cooldownMs: 3_000, travelMs: 900, offensive: true },
    shield: { id: "shield", name: "Protego", incantation: "Protego!", damage: 0, cooldownMs: 5_000, travelMs: 0, offensive: false },
    ice: { id: "ice", name: "Glacius", incantation: "Glacius!", damage: 10, cooldownMs: 7_000, travelMs: 700, offensive: true },
    ultimate: { id: "ultimate", name: "Fulmen", incantation: "Fulmen!", damage: 30, cooldownMs: 0, travelMs: 1_200, offensive: true },
  },
  powerUps: {
    empower: { id: "empower", name: "Empowered", durationMs: 8_000 },
    haste: { id: "haste", name: "Haste", durationMs: 6_000 },
    heal: { id: "heal", name: "Healing Draught", durationMs: 0 },
  },
};

export function makeMatchConfig(overrides: Partial<MatchConfig> = {}): MatchConfig {
  return { ...DEFAULT_MATCH_CONFIG, ...overrides };
}
