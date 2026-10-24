import type { MatchState, PlayerSlot, RoomSnapshot, SpellId } from "@spellcaster/shared";

const ROUND_MS = 60_000;
const COUNTDOWN_MS = 3_000;
const SPELLS: Record<SpellId, { damage: number; cooldownMs: number; travelMs: number }> = {
  incendio: { damage: 20, cooldownMs: 3_000, travelMs: 850 },
  protego: { damage: 0, cooldownMs: 5_000, travelMs: 0 },
  glacius: { damage: 10, cooldownMs: 7_000, travelMs: 500 },
};
const other = (slot: PlayerSlot): PlayerSlot => slot === "A" ? "B" : "A";

interface MatchRuntime {
  state: MatchState;
  cooldowns: Record<PlayerSlot, Partial<Record<SpellId, number>>>;
  guards: Partial<Record<PlayerSlot, number>>;
  defenseReadyAt: Record<PlayerSlot, number>;
  seenActions: Record<PlayerSlot, Set<string>>;
  countdown?: ReturnType<typeof setTimeout>;
  timeout?: ReturnType<typeof setTimeout>;
}

export class MatchManager {
  private readonly matches = new Map<string, MatchRuntime>();

  beginCountdown(room: RoomSnapshot, emit: (event: "MATCH_STATE" | "MATCH_START", state: MatchState) => void, finish: (event: { winner: PlayerSlot | "draw"; reason: "knockout" | "timeout"; hp: Record<PlayerSlot, number> }) => void) {
    let runtime = this.matches.get(room.code);
    const bothReady = Boolean(room.players.A?.ready && room.players.B?.ready);
    if (!bothReady) {
      if (runtime?.state.phase === "countdown") {
        if (runtime.countdown) clearTimeout(runtime.countdown);
        runtime.state.phase = "waiting";
        runtime.state.countdownEndsAt = null;
        emit("MATCH_STATE", this.snapshot(runtime));
      }
      return;
    }
    if (runtime?.state.phase === "active" || runtime?.state.phase === "countdown") return;
    runtime = this.create(room.code);
    runtime.state.phase = "countdown";
    runtime.state.countdownEndsAt = Date.now() + COUNTDOWN_MS;
    this.matches.set(room.code, runtime);
    emit("MATCH_STATE", this.snapshot(runtime));
    runtime.countdown = setTimeout(() => {
      const current = this.matches.get(room.code);
      if (!current || current !== runtime || current.state.phase !== "countdown") return;
      const now = Date.now();
      current.state.phase = "active";
      current.state.countdownEndsAt = null;
      current.state.endsAt = now + ROUND_MS;
      current.timeout = setTimeout(() => this.end(room.code, "timeout", finish), ROUND_MS);
      emit("MATCH_START", this.snapshot(current));
    }, COUNTDOWN_MS);
  }

  cast(room: RoomSnapshot, socketId: string, spell: SpellId, clientActionId: string, emit: (event: "SPELL_REJECTED" | "SPELL_ACCEPTED" | "MATCH_STATE" | "DAMAGE_APPLIED", payload: unknown) => void, finish: (event: { winner: PlayerSlot | "draw"; reason: "knockout" | "timeout"; hp: Record<PlayerSlot, number> }) => void) {
    const runtime = this.matches.get(room.code);
    const slot = this.slotFor(room, socketId);
    if (!runtime || !slot || runtime.state.phase !== "active") return emit("SPELL_REJECTED", { clientActionId, reason: "The duel is not active." });
    if (!clientActionId || clientActionId.length > 80 || runtime.seenActions[slot].has(clientActionId)) return emit("SPELL_REJECTED", { clientActionId, reason: "Duplicate or invalid action ID." });
    runtime.seenActions[slot].add(clientActionId);
    if (runtime.seenActions[slot].size > 500) runtime.seenActions[slot].delete(runtime.seenActions[slot].values().next().value!);
    const config = SPELLS[spell];
    if (!config) return emit("SPELL_REJECTED", { clientActionId, reason: "Unknown spell." });
    const now = Date.now();
    const availableAt = runtime.cooldowns[slot][spell] ?? 0;
    if (availableAt > now) return emit("SPELL_REJECTED", { clientActionId, reason: "That spell is recharging." });
    runtime.cooldowns[slot][spell] = now + config.cooldownMs;
    runtime.state.cooldowns[slot][spell] = now + config.cooldownMs;
    if (spell === "protego") {
      runtime.guards[slot] = now + 900;
      runtime.defenseReadyAt[slot] = now + config.cooldownMs;
    }
    emit("SPELL_ACCEPTED", { slot, spell, clientActionId, resolvesAt: now + config.travelMs });
    emit("MATCH_STATE", this.snapshot(runtime));
    if (config.damage === 0) return;
    setTimeout(() => {
      if (runtime.state.phase !== "active") return;
      const target = other(slot);
      if ((runtime.guards[target] ?? 0) >= Date.now()) return;
      runtime.state.hp[target] = Math.max(0, runtime.state.hp[target] - config.damage);
      emit("DAMAGE_APPLIED", { source: slot, target, spell, amount: config.damage, hp: { ...runtime.state.hp }, at: Date.now() });
      if (runtime.state.hp[target] === 0) this.end(room.code, "knockout", finish);
      else emit("MATCH_STATE", this.snapshot(runtime));
    }, config.travelMs);
  }

  defendStart(room: RoomSnapshot, socketId: string): MatchState | null {
    const runtime = this.matches.get(room.code);
    const slot = this.slotFor(room, socketId);
    const now = Date.now();
    if (runtime?.state.phase === "active" && slot && runtime.defenseReadyAt[slot] <= now) {
      runtime.guards[slot] = now + 900;
      runtime.defenseReadyAt[slot] = now + SPELLS.protego.cooldownMs;
      runtime.state.cooldowns[slot].protego = runtime.defenseReadyAt[slot];
      return this.snapshot(runtime);
    }
    return null;
  }

  defendEnd(room: RoomSnapshot, socketId: string) {
    const runtime = this.matches.get(room.code);
    const slot = this.slotFor(room, socketId);
    if (runtime && slot) runtime.guards[slot] = 0;
  }

  get(code: string) { const runtime = this.matches.get(code); return runtime ? this.snapshot(runtime) : null; }

  reset(code: string) { const runtime = this.matches.get(code); if (runtime?.timeout) clearTimeout(runtime.timeout); this.matches.delete(code); }

  private end(code: string, reason: "knockout" | "timeout", finish: (event: { winner: PlayerSlot | "draw"; reason: "knockout" | "timeout"; hp: Record<PlayerSlot, number> }) => void) {
    const runtime = this.matches.get(code);
    if (!runtime || runtime.state.phase === "finished") return;
    if (runtime.timeout) clearTimeout(runtime.timeout);
    const { A, B } = runtime.state.hp;
    const winner = A === B ? "draw" : A > B ? "A" : "B";
    runtime.state.phase = "finished";
    runtime.state.winner = winner;
    runtime.state.endsAt = null;
    finish({ winner, reason, hp: { ...runtime.state.hp } });
  }

  private create(code: string): MatchRuntime {
    return { state: { code, phase: "waiting", hp: { A: 100, B: 100 }, endsAt: null, countdownEndsAt: null, cooldowns: { A: {}, B: {} }, winner: null, serverNow: Date.now() }, cooldowns: { A: {}, B: {} }, guards: {}, defenseReadyAt: { A: 0, B: 0 }, seenActions: { A: new Set(), B: new Set() } };
  }

  private snapshot(runtime: MatchRuntime): MatchState { return { ...runtime.state, serverNow: Date.now(), hp: { ...runtime.state.hp }, cooldowns: { A: { ...runtime.state.cooldowns.A }, B: { ...runtime.state.cooldowns.B } } }; }
  private slotFor(room: RoomSnapshot, socketId: string): PlayerSlot | null { return room.players.A?.socketId === socketId ? "A" : room.players.B?.socketId === socketId ? "B" : null; }
}
