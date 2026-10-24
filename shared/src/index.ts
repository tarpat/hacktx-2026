export type PlayerSlot = "A" | "B";

export interface RoomPlayer {
  slot: PlayerSlot;
  socketId: string | null;
  connected: boolean;
  ready: boolean;
}

export interface RoomSnapshot {
  code: string;
  players: Record<PlayerSlot, RoomPlayer | null>;
  status: "waiting" | "ready";
}

export type SpellId = "incendio" | "protego" | "glacius";
export type MatchPhase = "waiting" | "countdown" | "active" | "finished";

export interface MatchState {
  code: string;
  phase: MatchPhase;
  hp: Record<PlayerSlot, number>;
  endsAt: number | null;
  countdownEndsAt: number | null;
  cooldowns: Record<PlayerSlot, Partial<Record<SpellId, number>>>;
  winner: PlayerSlot | "draw" | null;
  serverNow: number;
}

export interface CastRequest {
  spell: SpellId;
  clientActionId: string;
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

export interface ClientToServerEvents {
  CREATE_ROOM: (callback: (result: CreateRoomResult | SocketError) => void) => void;
  JOIN_ROOM: (code: string, sessionToken: string | null, callback: (result: JoinRoomResult | SocketError) => void) => void;
  READY_STATUS: (ready: boolean) => void;
  CAST_REQUEST: (request: CastRequest) => void;
  DEFEND_START: () => void;
  DEFEND_END: () => void;
}

export interface ServerToClientEvents {
  ROOM_UPDATED: (room: RoomSnapshot) => void;
  PLAYER_DISCONNECTED: (slot: PlayerSlot, recoveryExpiresAt: number) => void;
  PLAYER_RECONNECTED: (slot: PlayerSlot) => void;
  MATCH_STATE: (state: MatchState) => void;
  MATCH_START: (state: MatchState) => void;
  SPELL_ACCEPTED: (event: { slot: PlayerSlot; spell: SpellId; clientActionId: string; resolvesAt: number }) => void;
  SPELL_REJECTED: (event: { clientActionId: string; reason: string }) => void;
  DAMAGE_APPLIED: (event: { source: PlayerSlot; target: PlayerSlot; spell: SpellId; amount: number; hp: Record<PlayerSlot, number>; at: number }) => void;
  MATCH_END: (event: { winner: PlayerSlot | "draw"; reason: "knockout" | "timeout"; hp: Record<PlayerSlot, number> }) => void;
}

export interface SocketError {
  error: string;
}
