import type { SpellId } from "@spellcaster/shared";
import { incantationFor, spellsFromTranscript } from "./commands.ts";
import { prepareMicrophone, speechEnvironment } from "./browser.ts";

export interface SpeechResult { isFinal: boolean; 0: { transcript: string } }
export interface SpeechResultEvent { resultIndex: number; results: ArrayLike<SpeechResult> }
export interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  processLocally?: boolean;
  phrases?: unknown[];
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: SpeechResultEvent) => void) | null;
  start(): void;
  abort(): void;
}
export type RecognitionFactory = () => Recognition;
export type ProcessingMode = "auto" | "local" | "browser";
export interface VoiceState {
  supported: boolean;
  enabled: boolean;
  mode: ProcessingMode;
  status: "idle" | "starting" | "listening" | "reconnecting";
  processing: "local" | "browser" | null;
  transcript: string;
  interim: boolean;
  message: string;
  requestedSpell: SpellId | null;
  /** Overhead after receiving text, not microphone-to-transcript latency. */
  lastDispatchMs: number | null;
}

const errors: Record<string, string> = {
  "not-allowed": "Microphone access was denied. Allow it in your browser, then press Resume voice.",
  "service-not-allowed": "Speech recognition is blocked by this browser. Other controls still work.",
  "audio-capture": "No microphone is available. Check your input device, then press Resume voice.",
  "language-not-supported": "On-device English recognition is unavailable. Choose Automatic or Browser service.",
};

/** Dispatch exact incantations inside the interim callback, without waiting for silence. */
export class VoiceCaster {
  private readonly factory: RecognitionFactory | null;
  private readonly prepare: () => Promise<void>;
  private readonly localAvailable: () => Promise<boolean>;
  private readonly hints: () => unknown[];
  private readonly now: () => number;
  private readonly onCast: (spell: SpellId) => void;
  private readonly isActive: () => boolean;
  private readonly listeners = new Set<() => void>();
  private readonly lastCast = new Map<SpellId, number>();
  private recognition: Recognition | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private disposed = false;
  private wanted = false;
  private paused = false;
  private prepared = false;
  private mode: ProcessingMode = "auto";
  private forceBrowser = false;
  private selectedLocal: boolean | null = null;
  private disableHints = false;
  private networkFailures = 0;
  private silentEnds = 0;
  private state: VoiceState;

  constructor(options: {
    factory?: RecognitionFactory | null;
    prepareMicrophone?: () => Promise<void>;
    localAvailable?: () => Promise<boolean>;
    hints?: () => unknown[];
    now?: () => number;
    onCast: (spell: SpellId) => void;
    isActive: () => boolean;
  }) {
    const native = speechEnvironment();
    const injected = options.factory !== undefined;
    this.factory = injected ? options.factory! : native.factory;
    this.prepare = options.prepareMicrophone ?? (injected ? async () => {} : prepareMicrophone);
    this.localAvailable = options.localAvailable ?? (injected ? async () => false : native.localAvailable);
    this.hints = options.hints ?? native.hints;
    this.now = options.now ?? (() => performance.now());
    this.onCast = options.onCast;
    this.isActive = options.isActive;
    this.state = { supported: !!this.factory, enabled: false, mode: "auto", status: "idle", processing: null,
      transcript: "", interim: false, requestedSpell: null, lastDispatchMs: null,
      message: this.factory ? "Voice is ready." : "Speech recognition is unavailable in this browser. Keyboard and gestures still work." };
  }

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<VoiceState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  async start(mode: ProcessingMode = this.mode): Promise<void> {
    if (this.disposed || !this.factory) return;
    if (this.wanted && mode === this.mode && this.state.status !== "idle") return;
    this.clear();
    this.mode = mode;
    this.forceBrowser = false;
    this.selectedLocal = null;
    this.networkFailures = this.silentEnds = 0;
    this.wanted = true;
    this.update({ enabled: true, mode });
    if (!this.paused) await this.begin();
  }

  private async begin() {
    if (this.disposed || !this.wanted || this.paused || !this.factory) return;
    const ticket = ++this.generation;
    const current = () => !this.disposed && this.wanted && !this.paused && ticket === this.generation;
    this.update({ status: "starting", message: "Allow microphone access to start automatic voice casting…" });
    try {
      if (!this.prepared) { await this.prepare(); this.prepared = true; }
      if (!current()) return;
      let useLocal = this.mode === "local";
      if (this.mode === "auto" && !this.forceBrowser) {
        if (this.selectedLocal === null) {
          const available = await this.localAvailable();
          if (!current()) return;
          this.selectedLocal = available;
        }
        useLocal = this.selectedLocal;
      }
      if (!current()) return;
      const recognition = this.factory();
      if (useLocal && !("processLocally" in recognition)) { this.fail(errors["language-not-supported"]); return; }
      recognition.lang = "en-US";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      if ("processLocally" in recognition) recognition.processLocally = useLocal;
      if (useLocal && !this.disableHints && "phrases" in recognition) {
        try { recognition.phrases = this.hints(); } catch { /* Hints are optional. */ }
      }
      this.recognition = recognition;
      let finalized = -1;
      let pruned = -1;
      const consumed = new Map<number, number>();
      recognition.onstart = () => {
        if (current()) this.update({ status: "listening", processing: useLocal ? "local" : "browser", message: "Listening: incendio, protego, glacius, fulmen." });
      };
      recognition.onresult = (event) => {
        if (!current()) return;
        const receivedAt = this.now();
        this.networkFailures = this.silentEnds = 0;
        for (let index = Math.max(0, event.resultIndex); index < event.results.length; index++) {
          if (index <= finalized || index <= pruned) continue;
          const result = event.results[index];
          const transcript = result[0]?.transcript ?? "";
          this.update({ transcript: transcript.slice(-200), interim: !result.isFinal });
          const spells = spellsFromTranscript(transcript);
          const count = consumed.get(index) ?? 0;
          // Already-dispatched positions stay consumed when an interim word is revised.
          consumed.set(index, Math.max(count, spells.length));
          for (let position = count; position < spells.length; position++) {
            const spell = spells[position];
            const now = this.now();
            if (!this.isActive() || now - (this.lastCast.get(spell) ?? -Infinity) < 400) continue;
            this.lastCast.set(spell, now);
            this.onCast(spell); // No timer, final-result wait, fetch or acknowledgement gate.
            this.update({ requestedSpell: spell, lastDispatchMs: Math.max(0, this.now() - receivedAt), message: `Requested ${incantationFor(spell)}. Listening…` });
          }
          if (result.isFinal) { finalized = index; consumed.delete(index); }
          if (consumed.size > 128) { pruned = consumed.keys().next().value!; consumed.delete(pruned); }
          if (!spells.length && result.isFinal) this.update({ message: "Say incendio, protego, glacius, or fulmen. Still listening…" });
        }
      };
      recognition.onend = () => { if (current()) this.restart(Math.min(2_000, 100 * 2 ** Math.min(this.silentEnds++, 5))); };
      recognition.onerror = ({ error }) => {
        if (!current()) return;
        if (error === "language-not-supported" && useLocal && this.mode === "auto") { this.forceBrowser = true; this.restart(100); return; }
        if (error === "phrases-not-supported" && !this.disableHints) { this.disableHints = true; this.restart(100); return; }
        if (error === "no-speech" || error === "aborted") { this.restart(Math.min(2_000, 100 * 2 ** Math.min(this.silentEnds++, 5))); return; }
        if (error === "network" && ++this.networkFailures <= 3) { this.restart(250 * 2 ** (this.networkFailures - 1)); return; }
        this.fail(errors[error] ?? "Speech service unavailable. Press Resume voice to retry; other inputs still work.");
      };
      recognition.start();
    } catch (error) {
      if (!current()) return;
      const name = error instanceof Error ? error.name : "";
      this.fail(name === "NotAllowedError" ? errors["not-allowed"] : name === "NotFoundError" ? errors["audio-capture"]
        : "Could not start voice. Allow microphone access on localhost or HTTPS, then press Resume voice.");
    }
  }

  private clear() {
    this.generation++;
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    const recognition = this.recognition;
    this.recognition = null;
    if (recognition) {
      recognition.onstart = recognition.onend = recognition.onerror = recognition.onresult = null;
      try { recognition.abort(); } catch { /* Already ended. */ }
    }
  }
  private restart(delay: number) {
    this.clear();
    this.update({ status: "reconnecting", message: "Keeping the microphone ready…" });
    this.timer = setTimeout(() => { this.timer = null; void this.begin(); }, delay);
  }
  private fail(message: string) { this.wanted = false; this.clear(); this.update({ enabled: false, status: "idle", message }); }
  setProcessingMode(mode: ProcessingMode) {
    if (this.disposed) return;
    if (this.wanted) void this.start(mode);
    else { this.mode = mode; this.update({ mode }); }
  }
  pause() {
    if (this.disposed || this.paused) return;
    this.paused = true; this.clear();
    if (this.factory) this.update({ status: "idle", message: "Voice paused while this duel is inactive." });
  }
  resume() { this.paused = false; if (this.wanted && !this.disposed && this.state.status === "idle") void this.begin(); }
  stop() {
    if (this.disposed) return;
    this.wanted = false; this.clear();
    if (this.factory) this.update({ enabled: false, status: "idle", message: "Voice stopped. Press Resume voice to listen again." });
  }
  dispose() { if (!this.disposed) { this.clear(); this.disposed = true; this.wanted = false; this.listeners.clear(); } }
}
