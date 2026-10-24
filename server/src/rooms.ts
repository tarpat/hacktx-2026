import type { PlayerSlot, RoomPlayer, RoomSnapshot } from "@spellcaster/shared";
import { randomUUID } from "node:crypto";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const RECOVERY_GRACE_MS = 30_000;

interface Room {
  code: string;
  players: Record<PlayerSlot, RoomPlayer | null>;
  inMatch: boolean;
  recoveryTimers: Partial<Record<PlayerSlot, ReturnType<typeof setTimeout>>>;
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly recoveryTokens = new Map<string, { code: string; slot: PlayerSlot }>();

  create(socketId: string): { room: RoomSnapshot; playerSlot: PlayerSlot; sessionToken: string } {
    let code = this.makeCode();
    while (this.rooms.has(code)) code = this.makeCode();
    const room: Room = {
      code,
      players: {
        A: { slot: "A", socketId, connected: true, ready: false },
        B: null,
      },
      inMatch: false,
      recoveryTimers: {},
    };
    this.rooms.set(code, room);
    const sessionToken = randomUUID();
    this.recoveryTokens.set(sessionToken, { code, slot: "A" });
    return { room: this.snapshot(room), playerSlot: "A", sessionToken };
  }

  join(code: string, socketId: string, sessionToken: string | null): { room: RoomSnapshot; playerSlot: PlayerSlot; sessionToken: string; reconnected: boolean } | null {
    const room = this.rooms.get(code.trim().toUpperCase());
    if (!room) return null;
    const recovery = sessionToken ? this.recoveryTokens.get(sessionToken) : undefined;
    if (recovery?.code === room.code) {
      if (!room.players[recovery.slot] || room.players[recovery.slot]?.connected) return null;
      const player = room.players[recovery.slot]!;
      player.socketId = socketId;
      player.connected = true;
      const recoveryTimer = room.recoveryTimers[recovery.slot];
      if (recoveryTimer) clearTimeout(recoveryTimer);
      delete room.recoveryTimers[recovery.slot];
      return { room: this.snapshot(room), playerSlot: recovery.slot, sessionToken: sessionToken!, reconnected: true };
    }
    const slot: PlayerSlot | null = room.players.A === null ? "A" : room.players.B === null ? "B" : null;
    if (!slot) return null;
    room.players[slot] = { slot, socketId, connected: true, ready: false };
    const recoveryTimer = room.recoveryTimers[slot];
    if (recoveryTimer) clearTimeout(recoveryTimer);
    delete room.recoveryTimers[slot];
    const newToken = randomUUID();
    this.recoveryTokens.set(newToken, { code: room.code, slot });
    return { room: this.snapshot(room), playerSlot: slot, sessionToken: newToken, reconnected: false };
  }

  setReady(code: string, socketId: string, ready: boolean): RoomSnapshot | null {
    const room = this.rooms.get(code);
    if (!room) return null;
    const player = Object.values(room.players).find((entry) => entry?.socketId === socketId);
    if (!player) return null;
    player.ready = ready;
    return this.snapshot(room);
  }

  slotOf(code: string, socketId: string): PlayerSlot | null {
    const room = this.rooms.get(code);
    return Object.values(room?.players ?? {}).find((entry) => entry?.socketId === socketId)?.slot ?? null;
  }

  /** Marks a match as running; ending one clears ready flags so both players opt in to a rematch. */
  setInMatch(code: string, inMatch: boolean): RoomSnapshot | null {
    const room = this.rooms.get(code);
    if (!room) return null;
    room.inMatch = inMatch;
    if (!inMatch) for (const player of Object.values(room.players)) if (player) player.ready = false;
    return this.snapshot(room);
  }

  disconnect(code: string, socketId: string, onExpired: (room: RoomSnapshot) => void): { room: RoomSnapshot; slot: PlayerSlot; expiresAt: number } | null {
    const room = this.rooms.get(code);
    if (!room) return null;
    const player = Object.values(room.players).find((entry) => entry?.socketId === socketId);
    if (!player) return null;
    player.connected = false;
    player.socketId = null;
    player.ready = false;
    const slot = player.slot;
    const expiresAt = Date.now() + RECOVERY_GRACE_MS;
    room.recoveryTimers[slot] = setTimeout(() => {
      const current = this.rooms.get(code);
      if (!current || current.players[slot]?.connected) return;
      current.players[slot] = null;
      for (const [token, owner] of this.recoveryTokens) if (owner.code === code && owner.slot === slot) this.recoveryTokens.delete(token);
      delete current.recoveryTimers[slot];
      if (!current.players.A && !current.players.B) this.rooms.delete(code);
      else onExpired(this.snapshot(current));
    }, RECOVERY_GRACE_MS);
    return { room: this.snapshot(room), slot, expiresAt };
  }

  get(code: string): RoomSnapshot | null {
    const room = this.rooms.get(code.toUpperCase());
    return room ? this.snapshot(room) : null;
  }

  private snapshot(room: Room): RoomSnapshot {
    const players = {
      A: room.players.A ? { ...room.players.A } : null,
      B: room.players.B ? { ...room.players.B } : null,
    };
    const status = room.inMatch ? "in_match" : players.A?.ready && players.B?.ready ? "ready" : "waiting";
    return { code: room.code, players, status };
  }

  private makeCode(): string {
    return Array.from({ length: 5 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
  }
}
