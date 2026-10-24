import type { PlayerSlot, RoomPlayer, RoomSnapshot } from "@spellcaster/shared";

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

  create(socketId: string): { room: RoomSnapshot; playerSlot: PlayerSlot } {
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
    return { room: this.snapshot(room), playerSlot: "A" };
  }

  join(code: string, socketId: string): { room: RoomSnapshot; playerSlot: PlayerSlot } | null {
    const room = this.rooms.get(code.trim().toUpperCase());
    if (!room) return null;
    const slot: PlayerSlot | null = room.players.A === null ? "A" : room.players.B === null ? "B" : null;
    if (!slot) return null;
    room.players[slot] = { slot, socketId, connected: true, ready: false };
    const recovery = room.recoveryTimers[slot];
    if (recovery) clearTimeout(recovery);
    delete room.recoveryTimers[slot];
    return { room: this.snapshot(room), playerSlot: slot };
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
