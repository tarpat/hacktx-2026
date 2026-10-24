import {
  DEFAULT_MATCH_CONFIG,
  DuelBot,
  DuelEngine,
  EASY_BOT,
  makeMatchConfig,
  type GameEvent,
  type MatchState,
  type PlayerSlot,
  type PowerUpId,
  type SpellId,
} from "@spellcaster/shared";
import { socket } from "../socket";

export type DuelListener = (state: MatchState, events: GameEvent[]) => void;

/** Where match state comes from: a local engine (practice) or the authoritative server. */
export interface DuelSource {
  readonly localSlot: PlayerSlot;
  /** Current time on the clock the match state uses. */
  now(): number;
  state(): MatchState | null;
  cast(spell: SpellId, slot?: PlayerSlot, power?: number): void;
  powerUp(powerUp: PowerUpId, slot?: PlayerSlot): void;
  subscribe(listener: DuelListener): () => void;
  /** Starts a fresh match (practice) or asks the server for a rematch (online). */
  rematch(): void;
  dispose(): void;
}

const TICK_MS = 33;

// crypto.randomUUID only exists on HTTPS or localhost, and LAN testing is often plain HTTP.
let actionSeq = 0;
const actionId = () => `${Date.now().toString(36)}-${(++actionSeq).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** `bot`: easy AI opponent · `training`: dummy that never acts · `hotseat`: two players, one keyboard. */
export type LocalMode = "bot" | "training" | "hotseat";

/** Long round, sturdy dummy, and a fast ultimate meter so every spell can be tried. */
const TRAINING_CONFIG = makeMatchConfig({
  maxHp: 500,
  roundMs: 10 * 60_000,
  ultimateGain: { ...DEFAULT_MATCH_CONFIG.ultimateGain, perDamageDealt: 5 },
});

export class LocalDuel implements DuelSource {
  readonly localSlot: PlayerSlot = "A";
  private engine: DuelEngine;
  private bot: DuelBot | null;
  private latest: MatchState;
  private readonly listeners = new Set<DuelListener>();
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(private readonly mode: LocalMode) {
    this.engine = this.newEngine();
    this.bot = this.newBot();
    this.latest = this.engine.snapshot(Date.now());
    this.timer = setInterval(() => this.step(), TICK_MS);
  }

  now() {
    return Date.now();
  }

  state() {
    return this.latest;
  }

  cast(spell: SpellId, slot: PlayerSlot = this.localSlot, power?: number) {
    if (slot === "B" && this.mode !== "hotseat") return;
    this.engine.cast(slot, spell, Date.now(), power);
    this.step();
  }

  powerUp(powerUp: PowerUpId, slot: PlayerSlot = this.localSlot) {
    this.engine.grantPowerUp(slot, powerUp, Date.now());
    this.step();
  }

  subscribe(listener: DuelListener) {
    this.listeners.add(listener);
    listener(this.latest, []);
    return () => this.listeners.delete(listener);
  }

  rematch() {
    this.engine = this.newEngine();
    this.bot = this.newBot();
    this.step();
  }

  private newEngine() {
    return new DuelEngine(Date.now(), this.mode === "training" ? TRAINING_CONFIG : DEFAULT_MATCH_CONFIG);
  }

  private newBot() {
    return this.mode === "bot" ? new DuelBot("B", EASY_BOT) : null;
  }

  dispose() {
    clearInterval(this.timer);
    this.listeners.clear();
  }

  private step() {
    const now = Date.now();
    const botSpell = this.bot?.decide(this.engine.snapshot(now), now);
    if (botSpell) this.engine.cast("B", botSpell, now);
    this.latest = this.engine.snapshot(now);
    const events = this.engine.drainEvents();
    this.listeners.forEach((listener) => listener(this.latest, events));
  }
}

export class OnlineDuel implements DuelSource {
  private latest: MatchState | null = null;
  /** Estimated server clock minus local clock. */
  private offset = 0;
  private synced = false;
  private readonly listeners = new Set<DuelListener>();
  private readonly onState: DuelListener;

  constructor(readonly localSlot: PlayerSlot) {
    this.onState = (state, events) => {
      // Network delay only ever makes the server look behind, so keep the largest observed offset.
      const sample = state.now - Date.now();
      this.offset = this.synced ? Math.max(this.offset * 0.98 + sample * 0.02, sample) : sample;
      this.synced = true;
      this.latest = state;
      this.listeners.forEach((listener) => listener(state, events));
    };
    socket.on("MATCH_STATE", this.onState);
  }

  now() {
    return Date.now() + this.offset;
  }

  state() {
    return this.latest;
  }

  cast(spell: SpellId, _slot?: PlayerSlot, power?: number) {
    // Rejections come back as CAST_REJECTED events in the next MATCH_STATE.
    socket.emit("CAST_REQUEST", { spell, clientActionId: actionId(), power });
  }

  powerUp(powerUp: PowerUpId) {
    socket.emit("POWER_UP_REQUEST", { powerUp, clientActionId: actionId() });
  }

  subscribe(listener: DuelListener) {
    this.listeners.add(listener);
    if (this.latest) listener(this.latest, []);
    return () => this.listeners.delete(listener);
  }

  rematch() {
    socket.emit("READY_STATUS", true);
  }

  dispose() {
    socket.off("MATCH_STATE", this.onState);
    this.listeners.clear();
  }
}
