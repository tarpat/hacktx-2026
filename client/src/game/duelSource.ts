import {
  DEFAULT_MATCH_CONFIG,
  DuelBot,
  DuelEngine,
  EASY_BOT,
  makeMatchConfig,
  type FlairPatch,
  randomStageId,
  rollTraits,
  type GameEvent,
  type MatchState,
  type PlayerSlot,
  type PowerUpId,
  type SpellId,
  type Struggle,
  type TraitId,
  type PoseSample,
  POSE_RACE,
} from "@spellcaster/shared";
import { socket } from "../socket";
import { setFlair } from "./flair";

export type DuelListener = (state: MatchState, events: GameEvent[]) => void;

/** Where match state comes from: a local engine (practice) or the authoritative server. */
export interface DuelSource {
  readonly poseAssist: boolean;
  readonly localSlot: PlayerSlot;
  /** Current time on the clock the match state uses. */
  now(): number;
  state(): MatchState | null;
  cast(spell: SpellId, slot?: PlayerSlot, power?: number): void;
  powerUp(powerUp: PowerUpId, slot?: PlayerSlot): void;
  /** One push in a spell struggle. */
  push(slot?: PlayerSlot): void;
  poseSample(sample: PoseSample, slot?: PlayerSlot): void;
  subscribe(listener: DuelListener): () => void;
  /** Starts a fresh match (practice) or asks the server for a rematch (online). */
  rematch(): void;
  /** Practice only: restart the countdown once the arena has loaded, so players see all of it. */
  begin?(): void;
  /** Sends your name or face to the rival (online only). */
  shareFlair?(flair: FlairPatch): void;
  dispose(): void;
}

const TICK_MS = 33;

// crypto.randomUUID only exists on HTTPS or localhost, and LAN testing is often plain HTTP.
let actionSeq = 0;
const actionId = () => `${Date.now().toString(36)}-${(++actionSeq).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** `bot`: easy AI opponent · `training`: a sturdy rival that only acts when you drive it from the second key set. */
export type LocalMode = "bot" | "training";

/** Long round, sturdy dummy, and a fast ultimate meter so every spell can be tried. */
const TRAINING_CONFIG = makeMatchConfig({
  maxHp: 500,
  roundMs: 10 * 60_000,
  ultimateGain: { ...DEFAULT_MATCH_CONFIG.ultimateGain, perDamageDealt: 5 },
});

export class LocalDuel implements DuelSource {
  readonly poseAssist = true;
  readonly localSlot: PlayerSlot = "A";
  private engine: DuelEngine;
  private stageId: number | undefined;
  /** Rolled once per match, so the engine restarts while the arena loads keep the same traits. */
  private traits: Partial<Record<PlayerSlot, TraitId>> = {};
  /** Bot matches always roll traits; training stays a plain sandbox until you ask for a roll. */
  private withTraits: boolean;
  private bot: DuelBot | null;
  private latest: MatchState;
  private readonly listeners = new Set<DuelListener>();
  private readonly timer: ReturnType<typeof setInterval>;
  /** The countdown waits at its start until the arena calls begin() (or this fallback passes). */
  private holdUntil = Date.now() + 12_000;

  constructor(private readonly mode: LocalMode) {
    this.withTraits = mode === "bot";
    this.engine = this.newEngine();
    this.bot = this.newBot();
    this.latest = this.snapshot(Date.now());
    this.timer = setInterval(() => this.step(), TICK_MS);
  }

  now() {
    return Date.now();
  }

  state() {
    return this.latest;
  }

  cast(spell: SpellId, slot: PlayerSlot = this.localSlot, power?: number) {
    if (slot === "B" && this.mode !== "training") return;
    this.engine.cast(slot, spell, Date.now(), power);
    this.step();
  }

  push(slot: PlayerSlot = this.localSlot) {
    if (slot === "B" && this.mode !== "training") return;
    this.engine.push(slot, Date.now());
    this.step();
  }

  poseSample(sample: PoseSample, slot: PlayerSlot = this.localSlot) {
    if (slot === "B" && this.mode !== "training") return;
    this.engine.poseSample(slot, sample, Date.now());
    this.step();
  }

  /** Training only: both wizards fire at once and the clash opens the chosen struggle. */
  rehearseClash(kind: Struggle["kind"]) {
    if (this.mode !== "training") return;
    this.engine.rehearseClash(kind, Date.now());
    this.step();
  }

  /** Training only: restart with freshly rolled traits; later rematches keep rolling them. */
  rollTraits() {
    if (this.mode !== "training") return;
    this.withTraits = true;
    this.rematch();
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

  begin() {
    this.holdUntil = 0;
    this.engine = this.freshEngine(Date.now());
    this.step();
  }

  rematch() {
    this.engine = this.newEngine();
    this.bot = this.newBot();
    this.step();
  }

  private newEngine() {
    // Training uses the map picker; the bot gets a random stage.
    this.stageId = this.mode === "training" ? undefined : randomStageId();
    this.traits = this.withTraits ? rollTraits() : {};
    return this.freshEngine(Date.now());
  }

  private freshEngine(now: number) {
    return new DuelEngine(now, this.config(), Math.random, this.traits);
  }

  private config() {
    return this.mode === "training" ? TRAINING_CONFIG : DEFAULT_MATCH_CONFIG;
  }

  private snapshot(now: number): MatchState {
    return { ...this.engine.snapshot(now), ...(this.stageId === undefined ? {} : { stageId: this.stageId }) };
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
    // Still loading: keep the match pinned to the very start of its countdown.
    if (now < this.holdUntil) this.engine = this.freshEngine(now);
    const snapshot = this.snapshot(now);
    const botSpell = this.bot?.decide(snapshot, now);
    if (botSpell) this.engine.cast("B", botSpell, now);
    if (this.bot?.wantsPush(snapshot, now)) this.engine.push("B", now);
    if (this.bot && snapshot.struggle?.kind === "pose") {
      const race = snapshot.struggle.poseRace;
      const p = race.progress.B;
      // A visible simulated opponent: neutral first, then about 1.6 seconds per pose.
      const matched = now >= race.readyAt + p.step * 1_600 + POSE_RACE.releaseMs + 400;
      this.engine.poseSample("B", { struggleId: race.id, step: p.step, matched }, now);
    }
    this.latest = this.snapshot(now);
    const events = this.engine.drainEvents();
    this.listeners.forEach((listener) => listener(this.latest, events));
  }
}

export class OnlineDuel implements DuelSource {
  readonly poseAssist = false;
  private latest: MatchState | null = null;
  /** Estimated server clock minus local clock. */
  private offset = 0;
  private synced = false;
  private readonly listeners = new Set<DuelListener>();
  private readonly onState: DuelListener;
  private readonly onFlair = (slot: PlayerSlot, patch: FlairPatch) => setFlair(slot, patch);

  constructor(readonly localSlot: PlayerSlot) {
    this.onState = (state, events) => {
      // Network delay only ever makes the server look behind, so keep the largest observed offset.
      const sample = state.now - Date.now();
      // Ease toward later samples instead of jumping, so animations never skip; snap only on big drift.
      const target = Math.max(this.offset * 0.98 + sample * 0.02, sample);
      this.offset = this.synced && Math.abs(target - this.offset) < 250 ? this.offset + (target - this.offset) * 0.2 : target;
      this.synced = true;
      this.latest = state;
      this.listeners.forEach((listener) => listener(state, events));
    };
    socket.on("MATCH_STATE", this.onState);
    socket.on("FLAIR", this.onFlair);
  }

  shareFlair(flair: FlairPatch) {
    socket.emit("FLAIR", flair);
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

  push() {
    socket.emit("STRUGGLE_PUSH");
  }

  poseSample(sample: PoseSample) {
    socket.emit("POSE_SAMPLE", sample);
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
    socket.off("FLAIR", this.onFlair);
    this.listeners.clear();
  }
}
