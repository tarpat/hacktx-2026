import Phaser from "phaser";
import type { SpellId } from "@spellcaster/shared";
import { palette } from "../../theme";

type Point = { x: number; y: number };
type Phase = "idle" | "open" | "fire" | "fizzle";
export type CircleSpell = Exclude<SpellId, "shield">;

/** Ring radius in units, and how far in front of the wand it hangs. */
const RADIUS = 42;
const REACH = 56;
/** Seen from the side, the circle faces the opponent, so it reads as a tall ellipse. */
const SQUASH = 0.5;
const TILT = 0.12;
const FIRE_MS = 320;
const FIZZLE_MS = 420;
const GLYPHS = 10;
/** A circle nobody is feeding (a charge that never cast, a throw cut off by a hit) unravels after this. */
const EXPIRY_MS = 600;

/**
 * Each spell draws its own circle:
 * - fireball: flame tongues around the rim, a pentagram, embers rising;
 * - ice: crystal points, a six-armed snowflake, a slow turn;
 * - Fulmen: lightning crackling off the rim and a bolt through a triangle;
 * - Taurus: heavy notches and a pair of horns inside a doubled square.
 */
const LOOKS: Record<CircleSpell, { color: number; accent: number; spin: number; rise: boolean }> = {
  fireball: { color: palette.ember, accent: 0xffd36b, spin: 1.2, rise: true },
  ice: { color: palette.frost, accent: 0xeaf4ff, spin: 0.55, rise: false },
  ultimate: { color: palette.gold, accent: 0x9fd8ff, spin: 1.7, rise: false },
  taurus: { color: 0xff8a3c, accent: 0xffc48a, spin: 0.85, rise: false },
};

const clamp01 = (v: number) => Phaser.Math.Clamp(v, 0, 1);
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const polar = (angle: number, r: number) => new Phaser.Math.Vector2(Math.cos(angle) * r, Math.sin(angle) * r);

/** Three to four strokes between points of a 3x3 grid: reads as a rune without being any real script. */
function makeGlyph(): number[][] {
  const grid = () => [Phaser.Math.Between(-1, 1), Phaser.Math.Between(-1, 1)];
  const strokes: number[][] = [];
  while (strokes.length < Phaser.Math.Between(3, 4)) {
    const [a, b] = [grid(), grid()];
    if (a[0] !== b[0] || a[1] !== b[1]) strokes.push([...a, ...b]);
  }
  return strokes;
}

/** A spark in circle space, in fractions of the radius per millisecond. */
interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * The magic circle a wizard draws in front of the wand: the outer ring traces itself on, glyphs
 * light up around it and the spell's sigil turns inside. A charge fills it in as it builds; on
 * release the spell flies out of its center and the circle bursts, or it unravels on a fizzle.
 */
export class CastCircle {
  private readonly g: Phaser.GameObjects.Graphics;
  private phase: Phase = "idle";
  private phaseAt = 0;
  private openedAt = 0;
  private traceMs = 180;
  private expiresAt = 0;
  private spell: CircleSpell = "fireball";
  private power = 0;
  private warning = false;
  private spin = 0;
  private trace = 0;
  private center: Point | null = null;
  private glyphs: number[][][] = [];
  private motes: Mote[] = [];

  constructor(scene: Phaser.Scene, private readonly unit: number) {
    this.g = scene.add.graphics().setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
  }

  get isOpen() {
    return this.phase === "open";
  }

  /** Where the spell should leave from: the circle's center, once it has one. */
  get point(): Point | null {
    return this.phase === "idle" ? null : this.center;
  }

  private get look() {
    return LOOKS[this.spell];
  }

  /** Starts drawing the circle, closing the ring over `traceMs`. An open circle just switches spell. */
  open(spell: CircleSpell, now: number, traceMs: number) {
    this.spell = spell;
    this.expiresAt = Math.max(this.expiresAt, now + traceMs + EXPIRY_MS);
    if (this.phase === "open") return;
    this.phase = "open";
    this.openedAt = now;
    this.traceMs = Math.max(1, traceMs);
    this.power = 0;
    this.warning = false;
    this.center = null;
    this.glyphs = Array.from({ length: GLYPHS }, makeGlyph);
    this.motes = [];
  }

  /** Feeds a held charge: `power` 0–1 over the whole hold, `warning` near the auto-cancel. */
  charge(power: number, warning: boolean, now: number) {
    this.power = clamp01(power);
    this.warning = warning;
    this.expiresAt = now + EXPIRY_MS;
  }

  fire(now: number) {
    if (this.phase !== "open") return;
    this.phase = "fire";
    this.phaseAt = now;
  }

  fizzle(now: number) {
    if (this.phase !== "open") return;
    this.phase = "fizzle";
    this.phaseAt = now;
    for (const mote of this.motes) {
      const d = Math.hypot(mote.x, mote.y) || 1;
      mote.vx = (mote.x / d) * 0.0018;
      mote.vy = (mote.y / d) * 0.0018;
    }
  }

  /** `hand` is the wand tip; `facing` is +1 when the wizard faces right. */
  update(now: number, delta: number, hand: Point, facing: number) {
    if (this.phase === "open" && now > this.expiresAt) this.fizzle(now);
    if (this.phase === "idle") return;
    const target = { x: hand.x + facing * REACH * this.unit, y: hand.y };
    // It follows the wand while charging and stays put once it bursts.
    if (!this.center) this.center = target;
    else if (this.phase === "open") {
      const ease = 1 - Math.exp(-delta / 60);
      this.center = { x: this.center.x + (target.x - this.center.x) * ease, y: this.center.y + (target.y - this.center.y) * ease };
    }
    this.g.setPosition(this.center.x, this.center.y).setScale(SQUASH, 1).setRotation(facing * TILT);
    this.g.clear();

    if (this.phase === "open") return this.drawOpen(now, delta);
    if (this.phase === "fire") return this.drawFire(now, delta);
    this.drawFizzle(now, delta);
  }

  private drawOpen(now: number, delta: number) {
    this.trace = easeOut(clamp01((now - this.openedAt) / this.traceMs));
    const ready = this.trace >= 1;
    // Spins up as the charge builds and once the ring closes.
    this.spin += delta * this.look.spin * (0.0012 + (ready ? 0.0025 : 0) + this.power * 0.004);
    const pulse = ready ? 1 + Math.sin(now / 70) * 0.035 : 1;
    const r = RADIUS * this.unit * (0.65 + 0.35 * this.trace) * (0.92 + 0.28 * this.power) * pulse;
    const alpha = this.warning ? 0.55 + 0.45 * Math.abs(Math.sin(now / 45)) : 1;
    if (Math.random() < delta / (ready ? 22 : 40)) this.spawnMote();
    this.drawMotes(r, delta, alpha);
    this.drawCircle(r, this.trace, alpha, 1, now);
  }

  private drawFire(now: number, delta: number) {
    const e = clamp01((now - this.phaseAt) / FIRE_MS);
    if (e >= 1) return this.close();
    this.spin += delta * 0.01 * this.look.spin;
    const r = RADIUS * this.unit * (0.92 + 0.28 * this.power);
    // The circle blows outward and fades while its core collapses into the spell.
    this.drawCircle(r * (1 + 0.45 * easeOut(e)), 1, 1 - e, 1 - easeOut(e), now);
    this.drawMotes(r, delta, 1 - e);
    const flash = 1 - e;
    this.g.fillStyle(0xffffff, 0.85 * flash);
    this.g.fillCircle(0, 0, r * (0.35 + 0.4 * e));
    for (const [width, alpha] of [[7, 0.35], [2.5, 0.9]] as const) {
      this.g.lineStyle(width * this.unit * flash, this.look.color, alpha * flash);
      this.g.strokeCircle(0, 0, r * (1 + 1.3 * easeOut(e)));
    }
  }

  private drawFizzle(now: number, delta: number) {
    const e = clamp01((now - this.phaseAt) / FIZZLE_MS);
    if (e >= 1) return this.close();
    this.spin += delta * 0.0006;
    const r = RADIUS * this.unit * (0.92 + 0.28 * this.power) * (1 - 0.15 * e);
    // Unravels the way it was drawn.
    this.drawCircle(r, this.trace * (1 - e), (1 - e) * (0.6 + 0.4 * Math.abs(Math.sin(now / 35))), 1 - e, now);
    this.drawMotes(r, delta, 1 - e);
  }

  private close() {
    this.phase = "idle";
    this.motes = [];
    this.g.clear();
  }

  private drawCircle(r: number, trace: number, alpha: number, inner: number, now: number) {
    const { g, unit } = this;
    const { color } = this.look;
    if (alpha <= 0 || trace <= 0) return;
    g.fillStyle(color, 0.08 * alpha * trace);
    g.fillCircle(0, 0, r * 1.15);

    // Outer ring, traced on from the top.
    const start = -Math.PI / 2 + this.spin * 0.3;
    const end = start + Math.PI * 2 * trace;
    for (const [width, tint, a] of [[7, color, 0.3], [2.8, color, 0.95], [1.1, 0xffffff, 0.9]] as const) {
      g.lineStyle(width * unit, tint, a * alpha);
      g.beginPath();
      g.arc(0, 0, r, start, end);
      g.strokePath();
    }
    if (trace < 1) {
      g.fillStyle(0xffffff, alpha);
      g.fillCircle(Math.cos(end) * r, Math.sin(end) * r, 3.2 * unit);
    }

    // Glyph band between the outer and second ring, lit one by one as the ring passes.
    const band = clamp01((trace - 0.2) / 0.5);
    g.lineStyle(1.4 * unit, color, 0.8 * alpha * band);
    g.strokeCircle(0, 0, r * 0.8);
    const size = r * 0.075;
    this.glyphs.forEach((glyph, i) => {
      const lit = clamp01(trace * GLYPHS - i);
      if (lit <= 0) return;
      const angle = (i / GLYPHS) * Math.PI * 2 + this.spin;
      const cx = Math.cos(angle) * r * 0.9;
      const cy = Math.sin(angle) * r * 0.9;
      // Each glyph stands upright on the ring, pointing outward.
      const ux = Math.cos(angle);
      const uy = Math.sin(angle);
      g.lineStyle(1.8 * unit, 0xffffff, 0.95 * alpha * lit);
      for (const [x1, y1, x2, y2] of glyph) {
        g.lineBetween(cx + (x1 * -uy + y1 * ux) * size, cy + (x1 * ux + y1 * uy) * size, cx + (x2 * -uy + y2 * ux) * size, cy + (x2 * ux + y2 * uy) * size);
      }
    });
    this.drawRim(r, alpha * band, now);

    // The spell's sigil counter-rotates inside, then the core.
    const k = clamp01((trace - 0.45) / 0.55) * inner;
    if (k <= 0) return;
    this.drawSigil(r * k, alpha * k, now);
    g.fillStyle(color, 0.45 * alpha * k);
    g.fillCircle(0, 0, r * 0.2 * k * (1 + this.power * 0.5));
    g.fillStyle(0xffffff, 0.9 * alpha * k);
    g.fillCircle(0, 0, r * 0.09 * k * (1 + this.power));
  }

  /** Decoration just outside the ring. */
  private drawRim(r: number, alpha: number, now: number) {
    if (alpha <= 0) return;
    const { g, unit, spin } = this;
    const { color, accent } = this.look;
    switch (this.spell) {
      case "fireball":
        // Flame tongues licking outward, each flickering on its own beat.
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2 + spin * 0.6;
          const reach = r * (1.12 + 0.08 * Math.sin(now / 55 + i * 1.7));
          const half = 0.11;
          g.fillStyle(i % 2 ? accent : color, 0.75 * alpha);
          g.fillTriangle(Math.cos(a - half) * r, Math.sin(a - half) * r, Math.cos(a + half) * r, Math.sin(a + half) * r, Math.cos(a + 0.05) * reach, Math.sin(a + 0.05) * reach);
        }
        break;
      case "ice":
        // Six crystal points, each with a small V of branches.
        g.lineStyle(1.6 * unit, accent, 0.9 * alpha);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + spin * 0.4;
          const tip = polar(a, r * 1.22);
          const base = polar(a, r);
          g.lineBetween(base.x, base.y, tip.x, tip.y);
          const mid = polar(a, r * 1.1);
          for (const side of [-0.18, 0.18]) {
            const twig = polar(a + side, r * 1.17);
            g.lineBetween(mid.x, mid.y, twig.x, twig.y);
          }
        }
        break;
      case "ultimate":
        // Fresh lightning arcs every frame, jumping off the rim.
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * Math.PI * 2;
          const points = [polar(a, r)];
          for (let s = 1; s <= 4; s++) points.push(polar(a + (Math.random() - 0.5) * 0.35, r * (1 + 0.07 * s)));
          g.lineStyle(3.5 * unit, accent, 0.35 * alpha);
          g.strokePoints(points);
          g.lineStyle(1.3 * unit, 0xffffff, 0.95 * alpha);
          g.strokePoints(points);
        }
        break;
      case "taurus":
        // Eight heavy notches, like a hoof-struck seal.
        g.lineStyle(4.5 * unit, color, 0.9 * alpha);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + spin * 0.5;
          const from = polar(a, r * 1.03);
          const to = polar(a, r * 1.16);
          g.lineBetween(from.x, from.y, to.x, to.y);
        }
        break;
    }
  }

  private drawSigil(r: number, alpha: number, now: number) {
    const { g, unit } = this;
    const { color, accent } = this.look;
    const turn = -this.spin * 1.6;
    switch (this.spell) {
      case "fireball": {
        // Pentagram inside a ring.
        const star = r * 0.62;
        g.lineStyle(1.8 * unit, color, 0.9 * alpha);
        g.strokePoints([0, 2, 4, 1, 3].map((n) => polar(turn + (n * Math.PI * 2) / 5 - Math.PI / 2, star)), true);
        g.lineStyle(1.3 * unit, accent, 0.8 * alpha);
        g.strokeCircle(0, 0, star);
        break;
      }
      case "ice": {
        // Hexagon around a six-armed snowflake.
        const arm = r * 0.62;
        g.lineStyle(1.4 * unit, color, 0.85 * alpha);
        g.strokePoints([0, 1, 2, 3, 4, 5].map((n) => polar(turn * 0.5 + (n * Math.PI) / 3, arm)), true);
        g.lineStyle(1.7 * unit, accent, 0.95 * alpha);
        for (let n = 0; n < 6; n++) {
          const a = turn * 0.5 + (n * Math.PI) / 3 + Math.PI / 6;
          const tip = polar(a, arm * 0.85);
          g.lineBetween(0, 0, tip.x, tip.y);
          const knot = polar(a, arm * 0.5);
          for (const side of [-0.45, 0.45]) {
            const twig = polar(a + side, arm * 0.68);
            g.lineBetween(knot.x, knot.y, twig.x, twig.y);
          }
        }
        break;
      }
      case "ultimate": {
        // Two triangles and a zigzag bolt through the middle that flickers.
        const tri = r * 0.64;
        g.lineStyle(1.8 * unit, color, 0.9 * alpha);
        for (const offset of [0, Math.PI]) g.strokePoints([0, 1, 2].map((n) => polar(turn + offset + (n * Math.PI * 2) / 3 - Math.PI / 2, tri)), true);
        const flicker = 0.6 + 0.4 * Math.abs(Math.sin(now / 30));
        const h = r * 0.5;
        const bolt = [
          [0.15, -1],
          [-0.25, -0.05],
          [0.2, 0.05],
          [-0.15, 1],
        ].map(([x, y]) => new Phaser.Math.Vector2(x * h, y * h));
        g.lineStyle(4 * unit, accent, 0.5 * alpha * flicker);
        g.strokePoints(bolt);
        g.lineStyle(1.6 * unit, 0xffffff, alpha * flicker);
        g.strokePoints(bolt);
        break;
      }
      case "taurus": {
        // Two squares (an eight-point seal) holding a pair of horns.
        const box = r * 0.6;
        g.lineStyle(1.8 * unit, color, 0.9 * alpha);
        for (const offset of [0, Math.PI / 4]) g.strokePoints([0, 1, 2, 3].map((n) => polar(turn + offset + (n * Math.PI) / 2, box)), true);
        g.lineStyle(2.4 * unit, accent, 0.95 * alpha);
        for (const side of [-1, 1]) {
          g.beginPath();
          g.arc(side * r * 0.2, -r * 0.05, r * 0.24, side < 0 ? Math.PI * 0.55 : -Math.PI * 0.45, side < 0 ? Math.PI * 1.45 : Math.PI * 0.45, false);
          g.strokePath();
        }
        break;
      }
    }
  }

  private spawnMote() {
    const a = Math.random() * Math.PI * 2;
    if (this.look.rise) {
      // Embers lift out of the circle.
      const d = Math.random() * 0.9;
      this.motes.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, vx: (Math.random() - 0.5) * 0.0006, vy: -Phaser.Math.FloatBetween(0.0018, 0.003) });
    } else {
      // Everything else gathers inward.
      const d = Phaser.Math.FloatBetween(1.25, 1.6);
      const speed = Phaser.Math.FloatBetween(0.0025, 0.0045);
      this.motes.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, vx: -Math.cos(a) * speed, vy: -Math.sin(a) * speed });
    }
  }

  private drawMotes(r: number, delta: number, alpha: number) {
    const { color, accent } = this.look;
    this.motes = this.motes.filter((mote) => {
      mote.x += mote.vx * delta;
      mote.y += mote.vy * delta;
      const d = Math.hypot(mote.x, mote.y);
      if (d < 0.12 || d > 2 || mote.y < -1.7) return false;
      const fade = clamp01((1.7 - d) / 0.4) * alpha;
      this.g.fillStyle(d < 0.5 ? 0xffffff : this.look.rise && mote.y < -0.6 ? accent : color, fade);
      this.g.fillCircle(mote.x * r, mote.y * r, 1.8 * this.unit);
      return true;
    });
  }

  destroy() {
    this.g.destroy();
  }
}
