import { useSyncExternalStore } from "react";
import type { PlayerSlot, RoomSnapshot } from "@spellcaster/shared";
import { socket } from "./socket";

export interface Session {
  room: RoomSnapshot;
  slot: PlayerSlot;
  sessionToken?: string;
}

let current: Session | null = null;
const listeners = new Set<() => void>();

export function setSession(session: Session | null) {
  current = session;
  listeners.forEach((listener) => listener());
}

socket.on("ROOM_UPDATED", (room) => {
  if (current && current.room.code === room.code) setSession({ ...current, room });
});

export function useSession(): Session | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
