import { DuelEngine, type CastAck, type GameEvent, type MatchState, type PlayerSlot, type PowerUpId, type SpellId } from "@spellcaster/shared";

const TICK_MS = 50;
const HEARTBEAT_MS = 500;
const MAX_REMEMBERED_ACTIONS = 512;

/** Runs one authoritative duel for a room and reports state whenever something happens. */
export class MatchRunner {
  private readonly engine = new DuelEngine(Date.now());
  private readonly seenActions = new Set<string>();
  private readonly timer: ReturnType<typeof setInterval>;
  private lastBroadcastAt = 0;
  private done = false;

  constructor(
    private readonly broadcast: (state: MatchState, events: GameEvent[]) => void,
    private readonly onFinished: () => void,
  ) {
    this.flush(true);
    this.timer = setInterval(() => this.flush(), TICK_MS);
  }

  cast(slot: PlayerSlot, spell: SpellId, clientActionId: string): CastAck {
    if (!this.remember(slot, clientActionId)) return { ok: false, clientActionId, reason: "duplicate" };
    const result = this.engine.cast(slot, spell, Date.now());
    this.flush(true);
    return result.ok ? { ok: true, clientActionId } : { ok: false, clientActionId, reason: result.reason };
  }

  powerUp(slot: PlayerSlot, powerUp: PowerUpId, clientActionId: string): CastAck {
    if (!this.remember(slot, clientActionId)) return { ok: false, clientActionId, reason: "duplicate" };
    const granted = this.engine.grantPowerUp(slot, powerUp, Date.now());
    this.flush(true);
    return granted ? { ok: true, clientActionId } : { ok: false, clientActionId, reason: "not_active" };
  }

  get finished() {
    return this.engine.phase === "finished";
  }

  stop(): void {
    clearInterval(this.timer);
  }

  private remember(slot: PlayerSlot, clientActionId: string): boolean {
    const key = `${slot}:${clientActionId}`;
    if (this.seenActions.has(key)) return false;
    this.seenActions.add(key);
    if (this.seenActions.size > MAX_REMEMBERED_ACTIONS) this.seenActions.delete(this.seenActions.values().next().value!);
    return true;
  }

  private flush(force = false): void {
    const now = Date.now();
    const state = this.engine.snapshot(now);
    const events = this.engine.drainEvents();
    if (!force && events.length === 0 && now - this.lastBroadcastAt < HEARTBEAT_MS) return;
    this.lastBroadcastAt = now;
    this.broadcast(state, events);
    if (state.phase === "finished" && !this.done) {
      this.done = true;
      this.stop();
      this.onFinished();
    }
  }
}
