import { cues, type CueId } from "./cues.ts";
import { WebAudioBackend, type AudioBackend, type Sound, type Voice } from "./backend.ts";

export type PlayResult = "played" | "disabled" | "muted" | "cancelled" | "limited" | "failed";
export interface AudioState {
  enabled: boolean;
  muted: boolean;
  volume: number;
  activeVoices: number;
  error: string | null;
}

/** Playback only: no microphone, gameplay events, renderer, or server dependencies. */
export class AudioPlayer {
  private state: AudioState = { enabled: false, muted: false, volume: 0.7, activeVoices: 0, error: null };
  private readonly listeners = new Set<() => void>();
  private readonly sounds = new Map<CueId, Promise<Sound>>();
  private readonly voices = new Map<Voice, number>();
  private generation = 0;
  private disposed = false;
  private enabling: Promise<boolean> | null = null;
  private readonly backend: AudioBackend;
  private readonly baseUrl: string;
  private readonly maxVoices: number;

  constructor(options: { backend?: AudioBackend; baseUrl?: string; maxVoices?: number } = {}) {
    this.backend = options.backend ?? new WebAudioBackend();
    this.baseUrl = options.baseUrl ?? "/audio/";
    this.maxVoices = Math.max(1, Math.floor(options.maxVoices ?? 8));
  }

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private update(patch: Partial<AudioState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  enable(): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    if (this.enabling) return this.enabling;
    // Invoke unlock immediately in the click handler, before any asset loading.
    this.enabling = this.backend.unlock().then(() => {
      if (this.disposed) return false;
      this.update({ enabled: true, error: null });
      return true;
    }).catch(() => {
      if (!this.disposed) this.update({ enabled: false, error: "Audio could not start. Click Enable audio to retry." });
      return false;
    }).finally(() => { this.enabling = null; });
    return this.enabling;
  }

  private load(id: CueId) {
    let sound = this.sounds.get(id);
    if (!sound) {
      sound = this.backend.load(`${this.baseUrl}${cues[id].file}`).catch((error: unknown) => {
        this.sounds.delete(id); // A later request can retry a failed download/decode.
        throw error;
      });
      this.sounds.set(id, sound);
    }
    return sound;
  }

  async preload(): Promise<boolean> {
    if (!this.state.enabled || this.disposed) return false;
    try {
      await Promise.all((Object.keys(cues) as CueId[]).map((id) => this.load(id)));
      if (!this.disposed) this.update({ error: null });
      return !this.disposed;
    } catch {
      if (!this.disposed) this.update({ error: "Some sounds could not load. Individual cues can be retried." });
      return false;
    }
  }

  async play(id: CueId): Promise<PlayResult> {
    if (this.disposed || !this.state.enabled) return "disabled";
    if (this.state.muted || this.state.volume === 0) return "muted";
    const generation = this.generation;
    try {
      const sound = await this.load(id);
      if (this.disposed || generation !== this.generation) return "cancelled";
      if (this.state.muted || this.state.volume === 0) return "muted";
      if (this.voices.size >= this.maxVoices) return "limited";
      const voice = sound.play(this.state.volume * cues[id].gain, () => {
        this.voices.delete(voice);
        if (!this.disposed) this.update({ activeVoices: this.voices.size });
      });
      this.voices.set(voice, cues[id].gain);
      this.update({ activeVoices: this.voices.size, error: null });
      return "played";
    } catch {
      if (!this.disposed && generation === this.generation) {
        this.update({ error: `Could not play ${cues[id].label.toLowerCase()}. Retry the cue or enable audio again.` });
      }
      return "failed";
    }
  }

  setVolume(value: number) {
    if (this.disposed || !Number.isFinite(value)) return;
    this.update({ volume: Math.max(0, Math.min(1, value)) });
    this.applyVolume();
  }

  setMuted(muted: boolean) {
    if (this.disposed) return;
    this.update({ muted });
    this.applyVolume();
  }

  private applyVolume() {
    for (const [voice, gain] of this.voices) voice.setVolume(this.state.muted ? 0 : this.state.volume * gain);
  }

  stopAll() {
    this.generation++; // Also cancels requests still waiting for asset loading.
    for (const voice of [...this.voices.keys()]) voice.stop();
    this.voices.clear();
    if (!this.disposed) this.update({ activeVoices: 0 });
  }

  dispose() {
    if (this.disposed) return;
    this.stopAll();
    this.disposed = true;
    this.backend.dispose();
    this.sounds.clear();
    this.update({ enabled: false });
    this.listeners.clear();
  }
}
