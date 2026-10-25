import Phaser from "phaser";

type Point = { x: number; y: number };
type Phase = "idle" | "open" | "fire" | "fizzle";

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

const clamp01 = (v: number) => Phaser.Math.Clamp(v, 0, 1);
const easeOut = (t: number) => 1 - (1 - t) ** 3;

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

interface Mote {
  angle: number;
  /** Fraction of the radius; motes spiral in while charging and drift out on a fizzle. */
  r: number;
  speed: number;
}

/**
 * The magic circle a wizard draws in front of the wand: the outer ring traces itself on, glyphs
 * light up around it and an inner star counter-rotates. A charge fills it in as it builds; on
 * release the spell flies out of its center and the circle bursts, or it unravels on a fizzle.
 */
export class CastCircle {
  private readonly g: Phaser.GameObjects.Graphics;
  private phase: Phase = "idle";
  private phaseAt = 0;
  private openedAt = 0;
  private traceMs = 180;
  private expiresAt = 0;
  private color = 0xffffff;
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

  /** Starts drawing the circle, closing the ring over `traceMs`. An open circle just takes the new color. */
  open(color: number, now: number, traceMs: number) {
    this.color = color;
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
    for (const mote of this.motes) mote.speed = -Math.abs(mote.speed) * 0.6;
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
    this.spin += delta * (0.0012 + (ready ? 0.0025 : 0) + this.power * 0.004);
    const pulse = ready ? 1 + Math.sin(now / 70) * 0.035 : 1;
    const r = RADIUS * this.unit * (0.65 + 0.35 * this.trace) * (0.92 + 0.28 * this.power) * pulse;
    const alpha = this.warning ? 0.55 + 0.45 * Math.abs(Math.sin(now / 45)) : 1;
    if (Math.random() < delta / (ready ? 22 : 40)) this.motes.push({ angle: Math.random() * Math.PI * 2, r: Phaser.Math.FloatBetween(1.25, 1.6), speed: Phaser.Math.FloatBetween(0.0025, 0.0045) });
    this.drawMotes(r, delta, alpha);
    this.drawRings(r, this.trace, alpha, 1);
  }

  private drawFire(now: number, delta: number) {
    const e = clamp01((now - this.phaseAt) / FIRE_MS);
    if (e >= 1) return this.close();
    this.spin += delta * 0.01;
    const r = RADIUS * this.unit * (0.92 + 0.28 * this.power);
    // The circle blows outward and fades while its core collapses into the spell.
    this.drawRings(r * (1 + 0.45 * easeOut(e)), 1, 1 - e, 1 - easeOut(e));
    this.drawMotes(r, delta, 1 - e);
    const flash = 1 - e;
    this.g.fillStyle(0xffffff, 0.85 * flash);
    this.g.fillCircle(0, 0, r * (0.35 + 0.4 * e));
    for (const [width, alpha] of [[7, 0.35], [2.5, 0.9]] as const) {
      this.g.lineStyle(width * this.unit * flash, this.color, alpha * flash);
      this.g.strokeCircle(0, 0, r * (1 + 1.3 * easeOut(e)));
    }
  }

  private drawFizzle(now: number, delta: number) {
    const e = clamp01((now - this.phaseAt) / FIZZLE_MS);
    if (e >= 1) return this.close();
    this.spin += delta * 0.0006;
    const r = RADIUS * this.unit * (0.92 + 0.28 * this.power) * (1 - 0.15 * e);
    // Unravels the way it was drawn.
    this.drawRings(r, this.trace * (1 - e), (1 - e) * (0.6 + 0.4 * Math.abs(Math.sin(now / 35))), 1 - e);
    this.drawMotes(r, delta, 1 - e);
  }

  private close() {
    this.phase = "idle";
    this.motes = [];
    this.g.clear();
  }

  private drawRings(r: number, trace: number, alpha: number, inner: number) {
    const { g, color, unit } = this;
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

    // Inner star and ring, counter-rotating, then the core.
    const k = clamp01((trace - 0.45) / 0.55) * inner;
    if (k <= 0) return;
    const star = r * 0.62 * k;
    g.lineStyle(1.7 * unit, color, 0.9 * alpha * k);
    for (const offset of [0, Math.PI]) {
      const points = [0, 1, 2].map((n) => {
        const a = -this.spin * 1.6 + offset + (n * Math.PI * 2) / 3 - Math.PI / 2;
        return new Phaser.Math.Vector2(Math.cos(a) * star, Math.sin(a) * star);
      });
      g.strokePoints(points, true);
    }
    g.lineStyle(1.3 * unit, color, 0.8 * alpha * k);
    g.strokeCircle(0, 0, r * 0.3 * k);
    g.fillStyle(color, 0.45 * alpha * k);
    g.fillCircle(0, 0, r * 0.24 * k * (1 + this.power * 0.5));
    g.fillStyle(0xffffff, 0.9 * alpha * k);
    g.fillCircle(0, 0, r * 0.1 * k * (1 + this.power));
  }

  private drawMotes(r: number, delta: number, alpha: number) {
    this.motes = this.motes.filter((mote) => {
      mote.r -= mote.speed * delta;
      mote.angle += delta * 0.002;
      if (mote.r <= 0.12 || mote.r > 2) return false;
      const fade = clamp01((1.6 - mote.r) / 0.4) * alpha;
      this.g.fillStyle(mote.r < 0.5 ? 0xffffff : this.color, fade);
      this.g.fillCircle(Math.cos(mote.angle) * r * mote.r, Math.sin(mote.angle) * r * mote.r, 1.8 * this.unit);
      return true;
    });
  }

  destroy() {
    this.g.destroy();
  }
}
