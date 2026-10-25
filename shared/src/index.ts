import type { CastRejectReason, GameEvent, MatchState, PlayerSlot, PowerUpId, SpellId } from "./game/types.js";
import type { CircleTrace } from "./game/circleTrace.js";
import type { PoseSample } from "./game/poses.js";

export * from "./game/types.js";
export * from "./game/config.js";
export * from "./game/engine.js";
export * from "./game/bot.js";
export * from "./game/poses.js";
export * from "./game/arenas.js";
export * from "./game/circleTrace.js";

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
  sessionToken: string;
}

export interface JoinRoomResult {
  room: RoomSnapshot;
  playerSlot: PlayerSlot;
  sessionToken: string;
  reconnected: boolean;
}

export interface CastRequest {
  spell: SpellId;
  /** Unique per intent so retries are never applied twice. */
  clientActionId: string;
  /** Charge power (0–1) for charged spells. */
  power?: number;
}

export interface PowerUpRequest {
  powerUp: PowerUpId;
  clientActionId: string;
}

export type CastAck = { ok: true; clientActionId: string } | { ok: false; clientActionId: string; reason: CastRejectReason };

export interface ClientToServerEvents {
  CREATE_ROOM: (callback: (result: CreateRoomResult | SocketError) => void) => void;
  JOIN_ROOM: (code: string, sessionToken: string | null, callback: (result: JoinRoomResult | SocketError) => void) => void;
  READY_STATUS: (ready: boolean) => void;
  LEAVE_ROOM: () => void;
  CAST_REQUEST: (request: CastRequest, callback?: (ack: CastAck) => void) => void;
  POWER_UP_REQUEST: (request: PowerUpRequest, callback?: (ack: CastAck) => void) => void;
  /** One push in a spell struggle. The engine rate-limits pushes, so no payload or ack is needed. */
  STRUGGLE_PUSH: () => void;
  CIRCLE_TRACE: (trace: CircleTrace) => void;
  POSE_SAMPLE: (sample: PoseSample) => void;
  /** Your display name, live webcam face or knockout snapshot, relayed to your rival. */
  FLAIR: (flair: FlairPatch) => void;
}

/** Fun extras shared between duelists. Images are small PNG data URLs. */
export interface FlairPatch {
  name?: string;
  face?: string;
  ko?: string;
}

export interface ServerToClientEvents {
  ROOM_UPDATED: (room: RoomSnapshot) => void;
  PLAYER_DISCONNECTED: (slot: PlayerSlot, recoveryExpiresAt: number) => void;
  PLAYER_RECONNECTED: (slot: PlayerSlot) => void;
  MATCH_STATE: (state: MatchState, events: GameEvent[]) => void;
  FLAIR: (slot: PlayerSlot, flair: FlairPatch) => void;
}

export interface SocketError {
  error: string;
}
