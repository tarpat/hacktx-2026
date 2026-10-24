import type { CastRejectReason, GameEvent, MatchState, PlayerSlot, PowerUpId, SpellId } from "./game/types.js";

export * from "./game/types.js";
export * from "./game/config.js";
export * from "./game/engine.js";
export * from "./game/bot.js";

export interface RoomPlayer {
  slot: PlayerSlot;
  socketId: string | null;
  connected: boolean;
  ready: boolean;
}

export interface RoomSnapshot {
  code: string;
  players: Record<PlayerSlot, RoomPlayer | null>;
  status: "waiting" | "ready" | "in_match";
}

export interface CreateRoomResult {
  room: RoomSnapshot;
  playerSlot: PlayerSlot;
}

export interface JoinRoomResult {
  room: RoomSnapshot;
  playerSlot: PlayerSlot;
}

export interface CastRequest {
  spell: SpellId;
  /** Unique per intent so retries are never applied twice. */
  clientActionId: string;
}

export interface PowerUpRequest {
  powerUp: PowerUpId;
  clientActionId: string;
}

export type CastAck = { ok: true; clientActionId: string } | { ok: false; clientActionId: string; reason: CastRejectReason };

export interface ClientToServerEvents {
  CREATE_ROOM: (callback: (result: CreateRoomResult | SocketError) => void) => void;
  JOIN_ROOM: (code: string, callback: (result: JoinRoomResult | SocketError) => void) => void;
  READY_STATUS: (ready: boolean) => void;
  CAST_REQUEST: (request: CastRequest, callback?: (ack: CastAck) => void) => void;
  POWER_UP_REQUEST: (request: PowerUpRequest, callback?: (ack: CastAck) => void) => void;
}

export interface ServerToClientEvents {
  ROOM_UPDATED: (room: RoomSnapshot) => void;
  PLAYER_DISCONNECTED: (slot: PlayerSlot, recoveryExpiresAt: number) => void;
  PLAYER_RECONNECTED: (slot: PlayerSlot) => void;
  MATCH_STATE: (state: MatchState, events: GameEvent[]) => void;
}

export interface SocketError {
  error: string;
}
