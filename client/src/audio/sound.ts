import type { GameEvent, PlayerSlot, SpellId } from "@spellcaster/shared";

/**
 * Game sound, all synthesized with Web Audio: no files to load.
 * Effects are grounded booms, roars and crackles; the music is a looping music-box waltz.
 */

const MUTE_KEY = "spellcaster:muted";

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
    musicBus.gain.value = 0.16;
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

/** A soft bell: a sine plus a quiet, inharmonic overtone. */
function bell(freq: number, start: number, duration = 0.6, volume = 0.25, bus?: GainNode | null) {
  tone(freq, start, duration, { volume, bus });
  tone(freq * 2.76, start, duration * 0.4, { volume: volume * 0.25, bus });
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

const note = (semitonesFromA4: number) => 440 * 2 ** (semitonesFromA4 / 12);
const C5 = note(3), C6 = note(15);

// ---------- effects ----------

export const sfx = {
  click() {
    noise(0, 0.03, { from: 2500, to: 2000, volume: 0.08, q: 1 });
  },
  countdownTick() {
    boom(0, 0.35);
  },
  duelStart() {
    boom(0, 0.7);
    rumble(0, 1.2, 0.3);
  },
  cast(spell: SpellId) {
    if (spell === "fireball") {
      // Flame bursting out: a low whump and a broadband roar that tails off.
      noise(0, 0.15, { from: 250, to: 120, volume: 0.6, type: "lowpass" });
      noise(0, 0.8, { from: 1200, to: 400, volume: 0.45, q: 0.4 });
      crackle(0.05, 0.6, 12, 1200);
    } else if (spell === "ice") {
      // A cold, sharp blast with crystal fractures.
      noise(0, 0.5, { from: 6000, to: 3000, volume: 0.25, type: "highpass" });
      noise(0, 0.12, { from: 800, to: 300, volume: 0.35, type: "lowpass" });
      crackle(0, 0.35, 10, 5000);
    } else if (spell === "shield") {
      // A barrier snapping up: a soft pressure "whoomp" and a low steady hum.
      noise(0, 0.3, { from: 200, to: 600, volume: 0.45, type: "lowpass" });
      tone(80, 0, 0.8, { type: "sine", volume: 0.25, attack: 0.05 });
      tone(160, 0, 0.6, { type: "sine", volume: 0.08, attack: 0.05 });
    } else if (spell === "ultimate") {
      // A lightning strike: a split-second crack, then thunder rolling away.
      noise(0, 0.06, { from: 9000, to: 4000, volume: 0.7, type: "highpass" });
      crackle(0, 0.2, 20, 4000);
      boom(0.04, 0.8);
      rumble(0.1, 2.0, 0.5);
    }
  },
  hit(spell: SpellId) {
    if (spell === "ice") {
      // Ice shattering on impact.
      boom(0, 0.35);
      crackle(0, 0.4, 18, 4500);
      noise(0, 0.3, { from: 7000, to: 4000, volume: 0.15, type: "highpass" });
    } else if (spell === "fireball") {
      // An explosion: a heavy boom with a burst of flame.
      boom(0, 0.7);
      noise(0, 0.7, { from: 900, to: 200, volume: 0.4, q: 0.4 });
      crackle(0.05, 0.4, 8, 1000);
    } else {
      boom(0, 0.9);
      rumble(0, 1.0, 0.4);
    }
  },
  block() {
    // A spell slamming into the barrier and dispersing.
    boom(0, 0.45);
    noise(0, 0.4, { from: 2500, to: 600, volume: 0.3, q: 0.6 });
  },
  frozen() {
    // Ice creeping over the target.
    crackle(0, 0.9, 14, 3500);
  },
  clash() {
    boom(0, 0.8);
    noise(0, 0.6, { from: 2000, to: 300, volume: 0.4, q: 0.5 });
  },
  struggleStart() {
    rumble(0, 1.2, 0.5);
  },
  push() {
    noise(0, 0.1, { from: 300, to: 150, volume: 0.3, type: "lowpass" });
  },
  ultimateReady() {
    // Power gathering: a swelling rush with electric crackle.
    noise(0, 1.2, { from: 200, to: 2500, volume: 0.25, q: 0.7 });
    crackle(0.6, 0.6, 8, 4000);
  },
  powerUp() {
    noise(0, 0.7, { from: 300, to: 2000, volume: 0.25, q: 0.7 });
  },
  rejected() {
    noise(0, 0.15, { from: 600, to: 250, volume: 0.15, type: "lowpass" });
  },
  victory() {
    boom(0, 0.6);
    // A low, open fifth swelling in: grand rather than cute.
    for (const f of [65.4, 98, 130.8]) tone(f, 0, 2.5, { type: "sine", volume: 0.15, attack: 0.6 });
    noise(0, 2.0, { from: 300, to: 3000, volume: 0.12, q: 0.5 });
  },
  defeat() {
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

/**
 * A little music-box waltz in C major (3/4). Each bar: melody notes as [semitone from C5, beats].
 * null is a rest. Chords are bass roots for the oom-pah-pah.
 */
const MELODY: [number | null, number][][] = [
  [[7, 1], [4, 1], [7, 1]],
  [[12, 2], [11, 1]],
  [[9, 1], [5, 1], [9, 1]],
  [[7, 3]],
  [[5, 1], [4, 1], [2, 1]],
  [[4, 1], [7, 1], [12, 1]],
  [[11, 1], [9, 1], [7, 1]],
  [[2, 2], [null, 1]],
  [[7, 1], [4, 1], [7, 1]],
  [[12, 2], [14, 1]],
  [[16, 1], [14, 1], [12, 1]],
  [[9, 3]],
  [[11, 1], [12, 1], [14, 1]],
  [[12, 1], [9, 1], [7, 1]],
  [[5, 1], [2, 1], [11, 1]],
  [[0, 3]],
];
// Bass roots per bar, semitones from C3.
const BASS = [0, 9, 5, 0, 7, 0, 5, 7, 0, 9, 5, 2, 7, 5, 7, 0];

const BEAT = 0.42;
let musicTimer = 0;
let nextBarAt = 0;
let bar = 0;

function scheduleBar(at: number) {
  const ac = ctx!;
  const offset = at - ac.currentTime;
  let beat = 0;
  for (const [semi, beats] of MELODY[bar]) {
    if (semi !== null) bell(C5 * 2 ** (semi / 12), offset + beat * BEAT, beats * BEAT + 0.6, 0.5, musicBus);
    beat += beats;
  }
  // Oom-pah-pah: low root, then two soft chord taps.
  const root = (C5 / 4) * 2 ** (BASS[bar] / 12);
  tone(root, offset, BEAT * 1.2, { type: "triangle", volume: 0.5, bus: musicBus });
  for (const b of [1, 2]) {
    tone(root * 2, offset + b * BEAT, BEAT * 0.6, { type: "sine", volume: 0.2, bus: musicBus });
    tone(root * 2 * 1.26, offset + b * BEAT, BEAT * 0.6, { type: "sine", volume: 0.15, bus: musicBus });
    tone(root * 3, offset + b * BEAT, BEAT * 0.6, { type: "sine", volume: 0.15, bus: musicBus });
  }
  // A twinkle at the end of every fourth bar.
  if (bar % 4 === 3) bell(C6 * 2, offset + 2.5 * BEAT, 0.5, 0.15, musicBus);
  bar = (bar + 1) % MELODY.length;
}

/** Starts the looping background waltz (safe to call repeatedly). */
export function startMusic() {
  const ac = audio();
  if (!ac || musicTimer) return;
  nextBarAt = ac.currentTime + 0.1;
  bar = 0;
  // Schedule a little ahead so timer jitter never causes gaps.
  musicTimer = window.setInterval(() => {
    while (nextBarAt < ac.currentTime + 1.5) {
      scheduleBar(nextBarAt);
      nextBarAt += 3 * BEAT;
    }
  }, 250);
}

/** Starts music on the first interaction (autoplay rules) and adds a soft click to every button. */
export function installGlobalSound() {
  const unlock = () => {
    startMusic();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  document.addEventListener("click", (event) => {
    if ((event.target as Element | null)?.closest?.("button, a")) sfx.click();
  });
}
