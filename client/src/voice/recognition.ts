import type { SpellId } from "@spellcaster/shared";
import { spellFromTranscript } from "./commands.ts";

export interface SpeechResult {
  isFinal: boolean;
  0: { transcript: string };
}
export interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<SpeechResult>;
}
export interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  processLocally?: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: SpeechResultEvent) => void) | null;
  start(): void;
  abort(): void;
}
export type RecognitionFactory = () => Recognition;

function browserFactory(): RecognitionFactory | null {
  if (typeof window === "undefined") return null;
  const browser = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  const Constructor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
  return Constructor ? () => new Constructor() : null;
}

export interface VoiceState {
  supported: boolean;
  status: "idle" | "starting" | "listening";
  transcript: string;
  interim: boolean;
  message: string;
  requestedSpell: SpellId | null;
}

const errors: Record<string, string> = {
  "not-allowed": "Microphone access was denied. Allow it in your browser, then try again.",
  "service-not-allowed": "The speech service is unavailable. Keyboard and gesture controls still work.",
  "audio-capture": "No microphone is available. Check your input device and try again.",
  "network": "The browser speech service could not connect. Try again or use another input.",
  "no-speech": "No speech heard. Click Speak a spell to try again.",
  "language-not-supported": "On-device English recognition is unavailable. Install your browser's language pack or opt in to its speech service.",
  "aborted": "Voice input stopped.",
};

/** One explicit listening action, one final command; never automatically restarts. */
export class VoiceCaster {
  private readonly factory: RecognitionFactory | null;
  private readonly listeners = new Set<() => void>();
  private recognition: Recognition | null = null;
  private state: VoiceState;
  private generation = 0;
  private disposed = false;
  private readonly onCast: (spell: SpellId) => void;
  private readonly isActive: () => boolean;

  constructor(options: { factory?: RecognitionFactory | null; onCast: (spell: SpellId) => void; isActive: () => boolean }) {
    this.factory = options.factory === undefined ? browserFactory() : options.factory;
    this.onCast = options.onCast;
    this.isActive = options.isActive;
    this.state = { supported: !!this.factory, status: "idle", transcript: "", interim: false,
      message: this.factory ? "Voice is off. Click Speak a spell when ready." : "Speech recognition is unavailable in this browser. Use the keyboard or gestures.", requestedSpell: null };
  }

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private update(patch: Partial<VoiceState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  start(allowBrowserService = false) {
    if (this.disposed || !this.factory || this.state.status !== "idle") return;
    if (!this.isActive()) { this.update({ message: "Wait for the duel to begin before speaking a spell." }); return; }
    try {
      const recognition = this.factory();
      if (!allowBrowserService && !("processLocally" in recognition)) {
        this.update({ message: "On-device recognition is unavailable. You can opt in to the browser speech service below." });
        return;
      }
      recognition.lang = "en-US";
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      if ("processLocally" in recognition) recognition.processLocally = !allowBrowserService;
      this.recognition = recognition;
      const generation = ++this.generation;
      const current = () => !this.disposed && generation === this.generation && this.recognition === recognition;
      recognition.onstart = () => { if (current()) this.update({ status: "listening", message: "Listening for one spell…" }); };
      recognition.onend = () => { if (current()) this.finish("Listening ended. Click Speak a spell to try again."); };
      recognition.onerror = (event) => {
        if (current()) this.finish(errors[event.error] ?? "Speech recognition failed. You can try again.");
      };
      recognition.onresult = (event) => {
        if (!current()) return;
        for (let index = event.resultIndex; index < event.results.length; index++) {
          const result = event.results[index];
          const transcript = result[0]?.transcript ?? "";
          this.update({ transcript: transcript.slice(0, 200), interim: !result.isFinal });
          if (!result.isFinal) continue;
          const spell = spellFromTranscript(transcript);
          // Detach/abort before dispatching: duplicate final results cannot cast again.
          this.finish(!spell ? "No single spell recognized. Try fireball, shield, ice, or ultimate."
            : !this.isActive() ? "The duel is not active. No attack requested."
            : `Requested ${spell}. The duel decides whether it can be cast.`);
          if (spell && this.isActive()) {
            this.update({ requestedSpell: spell });
            this.onCast(spell);
          }
          break;
        }
      };
      this.update({ status: "starting", transcript: "", interim: false, requestedSpell: null, message: "Starting microphone…" });
      recognition.start();
    } catch {
      this.finish("Could not start voice input. Check microphone permissions and speech support, then try again.");
    }
  }

  private finish(message: string) {
    this.generation++;
    const recognition = this.recognition;
    this.recognition = null;
    if (recognition) {
      recognition.onstart = recognition.onend = recognition.onerror = recognition.onresult = null;
      try { recognition.abort(); } catch { /* Already ended; no microphone restart. */ }
    }
    if (!this.disposed) this.update({ status: "idle", interim: false, message });
  }
  stop() { if (!this.disposed && this.recognition) this.finish("Voice input stopped."); }
  dispose() {
    if (this.disposed) return;
    this.finish("Voice input stopped.");
    this.disposed = true;
    this.listeners.clear();
  }
}
