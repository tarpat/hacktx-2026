import type { GameEvent, PlayerSlot, SpellId } from "@spellcaster/shared";

/**
 * Game sound: recorded effects and battle music from assets/audio (sources in CREDITS.txt),
 * layered with synthesized whooshes, booms and the hold-to-charge drone.
 */

const MUTE_KEY = "spellcaster:muted";
const MUSIC_LEVEL = 0.32;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let muted = readMuted();
const muteListeners = new Set<(muted: boolean) => void>();

function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Lazily builds the audio graph. Browsers only allow this after a user gesture. */
function audio(): AudioContext | null {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(ctx.destination);
    // Effects go through a room reverb and a compressor so they sound weighty, not thin.
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.ratio.value = 4;
    compressor.connect(master);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.7;
    sfxBus.connect(compressor);
    const reverb = ctx.createConvolver();
    reverb.buffer = impulse(ctx, 1.8);
    const wet = ctx.createGain();
    wet.gain.value = 0.3;
    sfxBus.connect(reverb).connect(wet).connect(compressor);
    musicBus = ctx.createGain();
    musicBus.gain.value = MUSIC_LEVEL;
    musicBus.connect(master);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** A decaying stereo noise burst: the impulse response of a stone hall. */
function impulse(ac: AudioContext, seconds: number) {
  const length = Math.floor(ac.sampleRate * seconds);
  const buffer = ac.createBuffer(2, length, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  }
  return buffer;
}

export function isMuted() {
  return muted;
}

export function setMuted(next: boolean) {
  muted = next;
  try {
    localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  } catch {
    // Storage blocked: the setting just won't persist.
  }
  if (ctx && master) master.gain.setTargetAtTime(next ? 0 : 0.8, ctx.currentTime, 0.05);
  muteListeners.forEach((listener) => listener(next));
}

export function onMuteChange(listener: (muted: boolean) => void) {
  muteListeners.add(listener);
  return () => {
    muteListeners.delete(listener);
  };
}

// ---------- building blocks ----------

interface ToneOptions {
  type?: OscillatorType;
  /** Frequency to glide to by the end of the note. */
  to?: number;
  attack?: number;
  volume?: number;
  /** Vibrato depth in Hz. */
  wobble?: number;
  bus?: GainNode | null;
}

function tone(freq: number, start: number, duration: number, o: ToneOptions = {}) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + start;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + duration);
  if (o.wobble) {
    const lfo = ac.createOscillator();
    const depth = ac.createGain();
    lfo.frequency.value = 7;
    depth.gain.value = o.wobble;
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + duration);
  }
  const peak = o.volume ?? 0.3;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + (o.attack ?? 0.005));
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(o.bus ?? sfxBus!);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

/** Filtered noise for whooshes, crackles and crunches. */
function noise(start: number, duration: number, o: { from: number; to: number; volume?: number; q?: number; type?: BiquadFilterType }) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + start;
  const buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * duration), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = o.type ?? "bandpass";
  filter.Q.value = o.q ?? 1.2;
  filter.frequency.setValueAtTime(o.from, t);
  filter.frequency.exponentialRampToValueAtTime(o.to, t + duration);
  const gain = ac.createGain();
  const peak = o.volume ?? 0.3;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + duration * 0.15);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  src.connect(filter).connect(gain).connect(sfxBus!);
  src.start(t);
}

/** A deep, punchy impact: a short sub-bass kick plus a muffled noise burst. */
function boom(start: number, volume = 0.5) {
  tone(70, start, 0.35, { type: "sine", to: 38, volume });
  noise(start, 0.25, { from: 600, to: 100, volume: volume * 0.8, type: "lowpass" });
}

/** Low rolling noise, like distant thunder or grinding stone. */
function rumble(start: number, duration: number, volume: number) {
  noise(start, duration, { from: 180, to: 60, volume, type: "lowpass", q: 0.7 });
}

/** Random short snaps: fire crackling or ice cracking, depending on pitch. */
function crackle(start: number, duration: number, count: number, freq = 1500) {
  for (let i = 0; i < count; i++) {
    const at = start + Math.random() * duration;
    noise(at, 0.03 + Math.random() * 0.04, { from: freq * (0.7 + Math.random()), to: freq * 0.5, volume: 0.15 + Math.random() * 0.15, q: 3 });
  }
}

// ---------- recorded clips ----------

const audioUrl = (file: string) => `${import.meta.env.BASE_URL}assets/audio/${file}.mp3`;

/** Each effect lists its takes; one is picked at random so repeats don't sound mechanical. */
const CLIPS = {
  click: ["click"],
  countdown: ["countdown"],
  duelStart: ["duel-start"],
  fireCast: ["fire-cast"],
  iceCast: ["ice-cast"],
  shield: ["shield"],
  ultimateCast: ["ultimate-cast"],
  fireHit: ["fire-hit-1", "fire-hit-2", "fire-hit-3"],
  iceHit: ["ice-hit-1", "ice-hit-2", "ice-hit-3"],
  lightning: ["lightning-1", "lightning-2", "lightning-3"],
  frozen: ["frozen"],
  block: ["block"],
  clash: ["clash"],
  push: ["push"],
  ultimateReady: ["ultimate-ready"],
  powerUp: ["power-up"],
  rejected: ["rejected"],
  taurusSnort: ["taurus-snort"],
  taurusStomp: ["taurus-stomp"],
  taurusBellow: ["taurus-bellow"],
  taurusGallop: ["taurus-gallop"],
} as const;

type Clip = keyof typeof CLIPS;

const buffers = new Map<string, Promise<AudioBuffer | null>>();

function loadBuffer(file: string, ac: AudioContext): Promise<AudioBuffer | null> {
  let promise = buffers.get(file);
  if (!promise) {
    promise = fetch(audioUrl(file))
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((data) => ac.decodeAudioData(data))
      .catch((err) => {
        console.warn(`Failed to load audio ${file}:`, err);
        return null;
      });
    buffers.set(file, promise);
  }
  return promise;
}

function preloadClips() {
  const ac = audio();
  if (!ac) return;
  for (const takes of Object.values(CLIPS)) for (const file of takes) void loadBuffer(file, ac);
}

/** Plays one take of a clip, slightly detuned each time. */
function play(clip: Clip, o: { volume?: number; delay?: number; rate?: number } = {}) {
  const ac = audio();
  if (!ac) return;
  const takes = CLIPS[clip];
  const file = takes[Math.floor(Math.random() * takes.length)];
  const requestedAt = ac.currentTime;
  void loadBuffer(file, ac).then((buffer) => {
    if (!buffer || !sfxBus) return;
    // A clip still loading when it was asked for plays late rather than not at all.
    const at = Math.max(ac.currentTime, requestedAt + (o.delay ?? 0));
    const src = ac.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = (o.rate ?? 1) * (0.96 + Math.random() * 0.08);
    const gain = ac.createGain();
    gain.gain.value = o.volume ?? 1;
    src.connect(gain).connect(sfxBus);
    src.start(at);
  });
}

// ---------- effects ----------

export const sfx = {
  click() {
    play("click", { volume: 0.6 });
  },
  countdownTick() {
    play("countdown", { volume: 0.8 });
    boom(0, 0.3);
  },
  duelStart() {
    play("duelStart");
    boom(0, 0.6);
    rumble(0, 1.2, 0.3);
  },
  cast(spell: SpellId) {
    if (spell === "fireball") {
      // Flame roaring out of the hand.
      play("fireCast", { volume: 0.9 });
      noise(0, 0.45, { from: 400, to: 1800, volume: 0.25, q: 0.8 });
    } else if (spell === "ice") {
      // A cold, glassy whistle.
      play("iceCast", { volume: 0.7 });
      noise(0, 0.4, { from: 6000, to: 2500, volume: 0.18, q: 2 });
    } else if (spell === "shield") {
      play("shield");
      boom(0, 0.25);
    } else if (spell === "taurus") {
      // A snort and a stomp, the bellow as the bull bursts out, then hooves thundering across.
      play("taurusSnort", { volume: 0.8 });
      play("taurusStomp", { delay: 0.3 });
      boom(0.3, 0.45);
      play("taurusBellow", { delay: 0.32, volume: 0.9 });
      play("taurusGallop", { delay: 0.34 });
      rumble(0.34, 1.2, 0.3);
    } else {
      // Calling the storm: a charged hum and thunder gathering far away.
      play("ultimateCast");
      crackle(0, 0.5, 12, 4000);
      rumble(0.1, 1.8, 0.35);
    }
  },
  hit(spell: SpellId) {
    if (spell === "fireball") {
      play("fireHit");
      boom(0, 0.5);
    } else if (spell === "ice") {
      play("iceHit");
      boom(0, 0.3);
    } else if (spell === "taurus") {
      // The horn toss: a body blow and a heavy ground thud.
      play("block", { volume: 0.7, rate: 0.7 });
      play("countdown", { rate: 0.8 });
      boom(0, 0.9);
      noise(0, 0.5, { from: 700, to: 150, volume: 0.35, q: 0.5 });
    } else {
      // The strike: a split-second crack, then the recorded thunder.
      noise(0, 0.06, { from: 9000, to: 4000, volume: 0.6, type: "highpass" });
      play("lightning");
      boom(0.02, 0.9);
      duckMusic(2.5);
    }
  },
  shieldShattered() {
    play("frozen", { rate: 0.8 });
    play("block", { volume: 0.8 });
    crackle(0, 0.3, 14, 5000);
  },
  block() {
    play("block");
    play("shield", { volume: 0.5, rate: 0.8 });
  },
  frozen() {
    // Ice locking around the target, just after the hit.
    play("frozen", { volume: 0.8, delay: 0.15 });
  },
  clash() {
    play("clash");
    boom(0, 0.5);
  },
  struggleStart() {
    play("clash", { volume: 0.7, rate: 0.85 });
    rumble(0, 1.2, 0.5);
  },
  push() {
    play("push", { volume: 0.7 });
  },
  ultimateReady() {
    play("ultimateReady");
    crackle(0.3, 0.6, 8, 4000);
  },
  powerUp() {
    play("powerUp", { volume: 0.8 });
  },
  rejected() {
    play("rejected", { volume: 0.6 });
  },
  victory() {
    duckMusic(3);
    boom(0, 0.6);
    // A low, open fifth swelling in.
    for (const f of [65.4, 98, 130.8]) tone(f, 0, 2.5, { type: "sine", volume: 0.15, attack: 0.6 });
    noise(0, 2.0, { from: 300, to: 3000, volume: 0.12, q: 0.5 });
  },
  defeat() {
    duckMusic(3);
    rumble(0, 2.0, 0.35);
    tone(55, 0, 2.0, { type: "sine", volume: 0.18, attack: 0.3 });
  },
};

// ---------- charging ----------

let charge: { stop: (fade: number) => void } | null = null;

/**
 * Sustained charge-up while a fist is held: a low hum and a rushing wind that
 * swell and brighten the longer you hold. Fire crackles; the ultimate buzzes with electricity.
 */
export function startCharge(kind: "fireball" | "ultimate") {
  stopCharge(0.05);
  const ac = audio();
  if (!ac || !sfxBus) return;
  const t = ac.currentTime;
  const rise = kind === "ultimate" ? 2.0 : 1.2;
  const out = ac.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(kind === "ultimate" ? 0.5 : 0.4, t + rise);
  out.connect(sfxBus);

  // Rushing air: looped noise through a band-pass that sweeps upward.
  const buffer = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const air = ac.createBufferSource();
  air.buffer = buffer;
  air.loop = true;
  const band = ac.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 1.5;
  band.frequency.setValueAtTime(kind === "ultimate" ? 200 : 300, t);
  band.frequency.exponentialRampToValueAtTime(kind === "ultimate" ? 3000 : 1800, t + rise);
  const airGain = ac.createGain();
  airGain.gain.value = 0.6;
  air.connect(band).connect(airGain).connect(out);

  // Low hum, with a tremolo that tightens as power builds.
  const base = kind === "ultimate" ? 45 : 60;
  const hum = ac.createOscillator();
  hum.type = "sawtooth";
  hum.frequency.setValueAtTime(base, t);
  hum.frequency.exponentialRampToValueAtTime(base * 1.15, t + rise);
  const humFilter = ac.createBiquadFilter();
  humFilter.type = "lowpass";
  humFilter.frequency.setValueAtTime(300, t);
  humFilter.frequency.exponentialRampToValueAtTime(1500, t + rise);
  const humGain = ac.createGain();
  humGain.gain.value = 0.25;
  const trem = ac.createOscillator();
  trem.frequency.setValueAtTime(4, t);
  trem.frequency.linearRampToValueAtTime(kind === "ultimate" ? 22 : 14, t + rise);
  const tremDepth = ac.createGain();
  tremDepth.gain.value = 0.12;
  trem.connect(tremDepth).connect(humGain.gain);
  hum.connect(humFilter).connect(humGain).connect(out);

  air.start(t);
  hum.start(t);
  trem.start(t);

  // Crackle of fire or electricity on top while it's held.
  const crackleTimer = window.setInterval(() => crackle(0, 0.25, kind === "ultimate" ? 5 : 3, kind === "ultimate" ? 3500 : 1500), 250);

  charge = {
    stop(fade) {
      window.clearInterval(crackleTimer);
      const now = ac.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.setValueAtTime(Math.max(out.gain.value, 0.0001), now);
      out.gain.exponentialRampToValueAtTime(0.0001, now + fade);
      for (const node of [air, hum, trem]) node.stop(now + fade + 0.05);
    },
  };
}

/** Ends the charge sound: quickly when it's released into a spell, slower when it fizzles. */
export function stopCharge(fade = 0.08) {
  charge?.stop(fade);
  charge = null;
}

/** Plays the right effects for a batch of engine events. */
export function playEvents(events: GameEvent[], localSlot: PlayerSlot, hotseat: boolean) {
  for (const event of events) {
    switch (event.type) {
      case "PHASE_CHANGED":
        if (event.phase === "active") sfx.duelStart();
        else if (event.phase === "suddenDeath") sfx.struggleStart();
        break;
      case "SPELL_CAST":
        sfx.cast(event.spell);
        break;
      case "CAST_REJECTED":
        if (hotseat || event.slot === localSlot) sfx.rejected();
        break;
      case "SPELL_BLOCKED":
        sfx.block();
        break;
      case "SHIELD_SHATTERED":
        sfx.shieldShattered();
        break;
      case "DAMAGE_APPLIED":
        sfx.hit(event.spell);
        break;
      case "FROZEN":
        sfx.frozen();
        break;
      case "SPELL_CLASH":
        sfx.clash();
        break;
      case "STRUGGLE_START":
        sfx.struggleStart();
        break;
      case "POWER_UP":
        sfx.powerUp();
        break;
      case "ULTIMATE_READY":
        if (hotseat || event.slot === localSlot) sfx.ultimateReady();
        break;
      case "MATCH_END":
        if (hotseat || event.winner === localSlot) sfx.victory();
        else sfx.defeat();
        break;
    }
  }
}

// ---------- music ----------

export type MusicTrack = "menu" | "battle";

const TRACK_FILES: Record<MusicTrack, string> = { menu: "music-menu", battle: "music-battle" };

let wantedTrack: MusicTrack = "menu";
let playing: { track: MusicTrack; src: AudioBufferSourceNode; gain: GainNode } | null = null;
let unlocked = false;

/** Crossfades to a looping track. Safe to call before the first interaction; it starts once audio unlocks. */
export function setMusic(track: MusicTrack) {
  wantedTrack = track;
  if (!unlocked || playing?.track === track) return;
  const ac = audio();
  if (!ac || !musicBus) return;
  void loadBuffer(TRACK_FILES[track], ac).then((buffer) => {
    if (!buffer || !musicBus || wantedTrack !== track || playing?.track === track) return;
    const t = ac.currentTime;
    if (playing) {
      const old = playing;
      old.gain.gain.setTargetAtTime(0, t, 0.4);
      old.src.stop(t + 2.5);
    }
    const src = ac.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(1, t + 1.2);
    src.connect(gain).connect(musicBus);
    src.start(t);
    playing = { track, src, gain };
  });
}

/** Pulls the music down under a big moment, then lets it swell back. */
function duckMusic(seconds: number) {
  if (!ctx || !musicBus) return;
  const t = ctx.currentTime;
  musicBus.gain.cancelScheduledValues(t);
  musicBus.gain.setTargetAtTime(MUSIC_LEVEL * 0.35, t, 0.05);
  musicBus.gain.setTargetAtTime(MUSIC_LEVEL, t + seconds, 0.6);
}

/** Starts music on the first interaction (autoplay rules) and adds a soft click to every button. */
export function installGlobalSound() {
  const unlock = () => {
    unlocked = true;
    preloadClips();
    setMusic(wantedTrack);
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  document.addEventListener("click", (event) => {
    if ((event.target as Element | null)?.closest?.("button, a")) sfx.click();
  });
}
