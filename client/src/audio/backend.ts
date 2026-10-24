export interface Voice {
  setVolume(volume: number): void;
  stop(): void;
}

export interface Sound {
  play(volume: number, onEnded: () => void): Voice;
}

export interface AudioBackend {
  unlock(): Promise<void>;
  load(url: string): Promise<Sound>;
  dispose(): void;
}

/** No context or permissions are requested until an explicit enable action. */
export class WebAudioBackend implements AudioBackend {
  private context: AudioContext | null = null;
  private readonly abort = new AbortController();
  private disposed = false;

  async unlock() {
    if (this.disposed) throw new Error("Audio has been disposed");
    this.context ??= new AudioContext();
    await this.context.resume();
    if (this.context.state !== "running") throw new Error("Click Enable audio to allow playback");
  }

  async load(url: string): Promise<Sound> {
    const context = this.context;
    if (!context || this.disposed) throw new Error("Enable audio first");
    const response = await fetch(url, { signal: this.abort.signal });
    if (!response.ok) throw new Error(`Audio asset returned ${response.status}`);
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    return {
      play(volume, onEnded) {
        if (context.state !== "running") throw new Error("Audio paused by browser; enable it again");
        const source = context.createBufferSource();
        const gain = context.createGain();
        source.buffer = buffer;
        gain.gain.value = volume;
        source.connect(gain).connect(context.destination);
        let ended = false;
        const cleanup = () => {
          if (ended) return;
          ended = true;
          source.disconnect();
          gain.disconnect();
          onEnded();
        };
        source.onended = cleanup;
        try { source.start(); } catch (error) {
          ended = true;
          source.disconnect();
          gain.disconnect();
          throw error;
        }
        return {
          setVolume(value) { if (!ended) gain.gain.value = value; },
          stop() { if (!ended) { source.stop(); cleanup(); } },
        };
      },
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.abort.abort();
    if (this.context) void this.context.close().catch(() => {});
  }
}
