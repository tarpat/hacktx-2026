import Phaser from "phaser";
import { DuelEngine, opponentOf, type PlayerSlot, type Struggle } from "@spellcaster/shared";
import { playerColor } from "../theme";

type Point = { x: number; y: number };

/** How far the beams wander from a straight line, in units; redrawn this often so they crackle without strobing. */
const BEAM_JITTER = 9;
const RESHAPE_MS = 70;
const SEGMENTS = 12;
/** The junction eases toward the engine's balance so 30 Hz state updates don't make it jump. */
const JUNCTION_EASE = 0.18;
const FADE_MS = 320;
/** Safety net in case the winning spell never shows up in the projectile list. */
const FINISHER_MAX_MS = 3000;

interface Finisher {
  winner: PlayerSlot;
  survivorId: string | null;
  startedAt: number;
  from: Point;
  seen: boolean;
}

/**
 * Priori Incantatem: during a spell struggle each wizard's wand pours a beam into a crackling
 * junction that slides toward whoever is losing. When it resolves, the winner's beam follows
 * their spell into the loser; on a draw both beams snap and fade.
 */
export class StruggleBeams {
  private readonly g: Phaser.GameObjects.Graphics;
  /** Soft halo, bright ring and white-hot core where the beams meet. */
  private readonly glow: Phaser.GameObjects.Container;
  private readonly sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private shown: number | null = null;
  private junction: Point | null = null;
  private noise: Record<PlayerSlot, number[]> = { A: [], B: [] };
  private reshapedAt = -Infinity;
  private finisher: Finisher | null = null;
  private fadingSince: number | null = null;
  private lastBeams: { from: Point; to: Point; slot: PlayerSlot; weight: number }[] = [];

  constructor(scene: Phaser.Scene, private readonly unit: number, sparkTexture: string) {
    this.g = scene.add.graphics().setDepth(7).setBlendMode(Phaser.BlendModes.ADD);
    const layer = (radius: number, color: number, alpha: number) => scene.add.circle(0, 0, radius * unit, color, alpha).setBlendMode(Phaser.BlendModes.ADD);
    this.glow = scene.add
      .container(0, 0, [layer(40, 0xffd66b, 0.18), layer(22, 0xfff1b8, 0.4), layer(11, 0xffffff, 0.75), layer(5, 0xffffff, 1)])
      .setDepth(7)
      .setVisible(false);
    this.sparks = scene.add.particles(0, 0, sparkTexture, {
      speed: { min: 60 * unit, max: 220 * unit },
      lifespan: { min: 180, max: 420 },
      scale: { start: 0.45 * unit, end: 0 },
      tint: [0xffffff, 0xfff1b8],
      blendMode: "ADD",
      frequency: 16,
      emitting: false,
    });
    this.sparks.setDepth(7);
  }

  /** The current junction, so the clash burst can go off where the beams actually met. */
  get point(): Point | null {
    return this.junction;
  }

  /**
   * `hands` are the wand tips; `projectileAt` finds the winning spell on screen, or undefined
   * once it has landed.
   */
  update(time: number, struggle: Struggle | null, hands: Record<PlayerSlot, Point>, projectileAt: (id: string) => Point | undefined) {
    if (time - this.reshapedAt > RESHAPE_MS) this.reshape(time);
    if (struggle) return this.drawStruggle(time, struggle, hands);
    if (this.finisher) return this.drawFinisher(time, hands, projectileAt);
    this.drawFade(time);
  }

  /** The struggle ended: a winner sends their spell down the beam; a draw snaps both beams. */
  resolve(time: number, winner: PlayerSlot | null, survivorId: string | null) {
    if (!this.junction) return;
    this.sparks.explode(40, this.junction.x, this.junction.y);
    this.sparks.stop();
    if (winner) this.finisher = { winner, survivorId, startedAt: time, from: this.junction, seen: false };
    else this.fadingSince = time;
    this.shown = null;
    this.junction = null;
    this.glow.setVisible(false);
  }

  private drawStruggle(time: number, struggle: Struggle, hands: Record<PlayerSlot, Point>) {
    this.finisher = null;
    this.fadingSince = null;
    // 0 = all the way at A's wand, 1 = at B's.
    const target = DuelEngine.strugglePosition(struggle);
    this.shown = this.shown === null ? target : this.shown + (target - this.shown) * JUNCTION_EASE;
    const wobble = Math.sin(time / 90) * 4 * this.unit;
    const junction = {
      x: Phaser.Math.Linear(hands.A.x, hands.B.x, this.shown),
      y: Phaser.Math.Linear(hands.A.y, hands.B.y, this.shown) + wobble,
    };
    this.junction = junction;

    // The winning side's beam swells; the losing side's thins.
    const lead = struggle.balance;
    this.lastBeams = [
      { slot: "A", from: hands.A, to: junction, weight: 1 + 0.6 * lead },
      { slot: "B", from: hands.B, to: junction, weight: 1 - 0.6 * lead },
    ];
    this.g.setAlpha(1).clear();
    for (const beam of this.lastBeams) this.drawBeam(beam.slot, beam.from, beam.to, beam.weight);

    const pulse = 1 + 0.18 * Math.sin(time / 55) + 0.5 * Math.abs(lead);
    this.glow.setVisible(true).setPosition(junction.x, junction.y).setScale(pulse);
    this.sparks.setPosition(junction.x, junction.y);
    if (!this.sparks.emitting) this.sparks.start();
  }

  private drawFinisher(time: number, hands: Record<PlayerSlot, Point>, projectileAt: (id: string) => Point | undefined) {
    const f = this.finisher!;
    const spell = f.survivorId ? projectileAt(f.survivorId) : undefined;
    if (spell) f.seen = true;
    const elapsed = time - f.startedAt;
    // The beam rides the winning spell until it lands. Spells drawn elsewhere (storms, bulls) get a quick surge instead.
    const done = (f.seen && !spell) || elapsed > FINISHER_MAX_MS || (!f.seen && elapsed > 400);
    if (done) {
      this.finisher = null;
      this.fadingSince = time;
      this.lastBeams = [{ slot: f.winner, from: hands[f.winner], to: spell ?? hands[opponentOf(f.winner)], weight: 1.6 }];
      return this.drawFade(time);
    }
    const loserHand = hands[opponentOf(f.winner)];
    const surge = Phaser.Math.Easing.Cubic.Out(Math.min(1, elapsed / 400));
    const to = spell ?? { x: Phaser.Math.Linear(f.from.x, loserHand.x, surge), y: Phaser.Math.Linear(f.from.y, loserHand.y, surge) };
    this.lastBeams = [{ slot: f.winner, from: hands[f.winner], to, weight: 1.6 }];
    this.g.setAlpha(1).clear();
    this.drawBeam(f.winner, hands[f.winner], to, 1.6);
  }

  private drawFade(time: number) {
    if (this.fadingSince === null) {
      if (this.lastBeams.length) this.g.clear();
      this.lastBeams = [];
      return;
    }
    const t = (time - this.fadingSince) / FADE_MS;
    if (t >= 1) {
      this.fadingSince = null;
      this.lastBeams = [];
      this.g.clear();
      return;
    }
    this.g.setAlpha(1 - t).clear();
    for (const beam of this.lastBeams) this.drawBeam(beam.slot, beam.from, beam.to, beam.weight * (1 - t));
  }

  private drawBeam(slot: PlayerSlot, from: Point, to: Point, weight: number) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    // Jitter sideways to the beam, pinned at both ends.
    const nx = -dy / length;
    const ny = dx / length;
    const points = this.noise[slot].map((n, i) => {
      const t = i / SEGMENTS;
      const pinned = Math.sin(t * Math.PI);
      return { x: from.x + dx * t + nx * n * pinned, y: from.y + dy * t + ny * n * pinned };
    });
    const color = playerColor[slot];
    const w = Math.max(0.2, weight) * this.unit;
    for (const [width, tint, alpha] of [[30, color, 0.16], [14, color, 0.45], [6, color, 0.9], [2.6, 0xffffff, 1]] as const) {
      this.g.lineStyle(width * w, tint, alpha);
      this.g.strokePoints(points);
    }
  }

  private reshape(time: number) {
    this.reshapedAt = time;
    for (const slot of ["A", "B"] as PlayerSlot[]) {
      this.noise[slot] = Array.from({ length: SEGMENTS + 1 }, () => Phaser.Math.FloatBetween(-1, 1) * BEAM_JITTER * this.unit);
    }
  }

  destroy() {
    this.g.destroy();
    this.glow.destroy();
    this.sparks.destroy();
  }
}
