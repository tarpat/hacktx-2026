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

export interface CreateRoomResult {
  room: RoomSnapshot;
  playerSlot: PlayerSlot;
}

export interface JoinRoomResult {
  room: RoomSnapshot;
  playerSlot: PlayerSlot;
}

export interface ClientToServerEvents {
  CREATE_ROOM: (callback: (result: CreateRoomResult | SocketError) => void) => void;
  JOIN_ROOM: (code: string, callback: (result: JoinRoomResult | SocketError) => void) => void;
  READY_STATUS: (ready: boolean) => void;
}

export interface ServerToClientEvents {
  ROOM_UPDATED: (room: RoomSnapshot) => void;
  PLAYER_DISCONNECTED: (slot: PlayerSlot, recoveryExpiresAt: number) => void;
  PLAYER_RECONNECTED: (slot: PlayerSlot) => void;
}

export interface SocketError {
  error: string;
}
