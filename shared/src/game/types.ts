export type PlayerSlot = "A" | "B";

export type SpellId = "fireball" | "shield" | "ice" | "ultimate" | "sixSeven";
export type PowerUpId = "empower" | "haste" | "heal";

export type MatchPhase = "countdown" | "active" | "suddenDeath" | "finished";
export type EndReason = "knockout" | "time" | "suddenDeath" | "draw";
export type LoserForm = "frog" | "teapot";

export type CastRejectReason = "not_active" | "cooldown" | "frozen" | "meter" | "duplicate" | "unknown";

export interface PlayerStats {
  casts: number;
  hits: number;
  blocks: number;
  damageDealt: number;
  clashesWon: number;
}

export interface PlayerState {
  slot: PlayerSlot;
  hp: number;
  maxHp: number;
  ultimate: number;
  /** Server timestamp at which each spell is castable again. */
  readyAt: Record<SpellId, number>;
  shieldUntil: number;
  frozenUntil: number;
  /** Empower lasts until this time or until the next attack, whichever comes first. */
  empoweredUntil: number;
  hasteUntil: number;
  powerUpReadyAt: number;
  stats: PlayerStats;
}

export interface Projectile {
  id: string;
  owner: PlayerSlot;
  spell: SpellId;
  damage: number;
  empowered: boolean;
  launchedAt: number;
  arrivesAt: number;
}

/**
 * Two of the same spell met mid-air and are locked together. Players push to shove the
 * clash toward their opponent; the winner's spell absorbs the loser's and flies on.
 */
export interface Struggle {
  spell: SpellId;
  /** The two locked projectiles, by owner. */
  projectiles: Record<PlayerSlot, Projectile>;
  startedAt: number;
  endsAt: number;
  /** Where the spells met across the arena: 0 = A's side, 1 = B's side. */
  meetAt: number;
  /** Tug-of-war balance: +1 means A has shoved it all the way to B, -1 the reverse. */
  balance: number;
  pushes: Record<PlayerSlot, number>;
  lastPushAt: Record<PlayerSlot, number>;
}

export interface MatchState {
  phase: MatchPhase;
  /** Shared arena layout selected by the server for online matches. */
  stageId?: number;
  /** Server clock when this snapshot was taken; clients use it to estimate offset. */
  now: number;
  /** End of the current phase (countdown, round or sudden death). Zero once finished. */
  phaseEndsAt: number;
  roundMs: number;
  players: Record<PlayerSlot, PlayerState>;
  projectiles: Projectile[];
  /** Active same-spell clash, if any. */
  struggle: Struggle | null;
  winner: PlayerSlot | null;
  endReason: EndReason | null;
  loserForm: LoserForm;
}

interface EventBase {
  id: number;
  at: number;
}

export type GameEvent = EventBase &
  (
    | { type: "PHASE_CHANGED"; phase: MatchPhase }
    | { type: "SPELL_CAST"; slot: PlayerSlot; spell: SpellId; projectileId: string | null; empowered: boolean }
    | { type: "CAST_REJECTED"; slot: PlayerSlot; spell: SpellId; reason: CastRejectReason }
    | { type: "SPELL_BLOCKED"; defender: PlayerSlot; spell: SpellId; damage: number }
    | { type: "DAMAGE_APPLIED"; target: PlayerSlot; spell: SpellId; amount: number; hp: number }
    | { type: "FROZEN"; slot: PlayerSlot; until: number }
    | { type: "SPELL_CLASH"; winner: PlayerSlot | null; survivorId: string | null; fizzledIds: string[] }
    | { type: "STRUGGLE_START"; spell: SpellId; endsAt: number }
    | { type: "POWER_UP"; slot: PlayerSlot; powerUp: PowerUpId }
    | { type: "ULTIMATE_READY"; slot: PlayerSlot }
    | { type: "MATCH_END"; winner: PlayerSlot | null; reason: EndReason }
  );

export type GameEventType = GameEvent["type"];

export type CastResult = { ok: true } | { ok: false; reason: CastRejectReason };
