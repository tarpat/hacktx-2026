import Phaser from "phaser";
import type { PlayerSlot, SpellId } from "@spellcaster/shared";

export type RigAction = "throw" | "ultimate" | "shield";

/** Wind-ups are short so a cast answers the input at once; hits still land on the engine's clock. */
const THROW_WINDUP = 180;
const ULTIMATE_WINDUP = 320;

/** Milliseconds from the start of a cast animation to the moment the spell leaves the hand. */
export const RELEASE_MS: Record<Exclude<SpellId, "shield">, number> = {
  fireball: THROW_WINDUP,
  ice: THROW_WINDUP,
  ultimate: ULTIMATE_WINDUP,
  taurus: THROW_WINDUP,
};

export interface WizardStyle {
  robe?: number;
  trim?: number;
  hat?: number;
  hatBand?: number;
  skin?: number;
  hair?: number;
  hairStyle?: "braid" | "curls";
  cape?: number;
  orb?: number;
}

interface WizardConfig {
  texture: string;
  targetHeight: number;
  originX: number;
  originY: number;
  staffX: number;
  staffY: number;
  orbColor: number;
  /** Where the face is in the art, as fractions of its width and height, and its diameter. */
  face: { x: number; y: number; size: number };
}

const WIZARD_CONFIGS: Record<PlayerSlot, WizardConfig> = {
  A: {
    texture: "wizard-green",
    targetHeight: 138,
    originX: 0.444,
    originY: 1.0,
    staffX: 56,
    staffY: -91,
    orbColor: 0xffe27a,
    face: { x: 0.56, y: 0.35, size: 0.26 },
  },
  B: {
    texture: "wizard-purple",
    targetHeight: 150,
    originX: 0.395,
    originY: 1.0,
    staffX: 47,
    staffY: -97,
    orbColor: 0xc9a8f0,
    face: { x: 0.57, y: 0.29, size: 0.23 },
  },
};

/** Keyframed offsets an action asks for; the springs below chase them. */
interface Pose {
  x: number;
  y: number;
  /** Spine bend, radians-ish: positive leans toward the opponent. */
  lean: number;
  scaleX: number;
  scaleY: number;
}

const REST: Pose = { x: 0, y: 0, lean: 0, scaleX: 1, scaleY: 1 };

/** Horizontal slices the illustration is cut into so the body can bend instead of tilting as a board. */
const STRIPS = 36;
/** Where the head starts, as a fraction of height from the feet. */
const NECK = 0.62;
/** Pieces the body breaks into when a wizard falls. */
const DUST = { cols: 9, rows: 12 };

/** A damped spring: snappy enough to follow poses, loose enough to overshoot on a hit. */
class Spring {
  value: number;
  velocity = 0;
  constructor(initial: number, private readonly stiffness: number, private readonly damping: number) {
    this.value = initial;
  }
  step(target: number, dt: number) {
    this.velocity += ((target - this.value) * this.stiffness - this.velocity * this.damping) * dt;
    this.value += this.velocity * dt;
    return this.value;
  }
}

const smooth = (t: number) => t * t * (3 - 2 * t);

export class WizardRig {
  readonly container: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly rig: Phaser.GameObjects.Container;
  private readonly strips: Phaser.GameObjects.Image[] = [];
  private readonly castNode: Phaser.GameObjects.Container;
  private readonly staffGlow: Phaser.GameObjects.Arc;
  private readonly cfg: WizardConfig;
  private readonly texture: string;
  private readonly width: number;
  private readonly height: number;
  private readonly baseScale: number;
  /** Pose offsets are authored for a 230-unit wizard; this scales them to the actual size. */
  private readonly px: number;

  private readonly slide = new Spring(0, 260, 16);
  private readonly lift = new Spring(0, 260, 18);
  private readonly lean = new Spring(0, 220, 13);
  /** Hat tip and hair trail the spine, so they flick after every move. */
  private readonly trail = new Spring(0, 90, 7);
  private readonly squash = new Spring(1, 320, 14);
  private readonly widen = new Spring(1, 320, 18);
  private readonly head = new Spring(0, 40, 9);
  private glance = { target: 0, nextAt: 0 };

  private action: { action: RigAction; start: number; releaseAt: number | null; onRelease?: () => void } | null = null;
  private dying: { start: number; onDone: () => void; shattered: boolean } | null = null;
  private flashUntil = 0;
  private cheering = false;
  private charged = false;
  /** The player's webcam face, pasted over the wizard's. */
  private face: Phaser.GameObjects.Image | null = null;

  constructor(scene: Phaser.Scene, slotOrStyle: PlayerSlot | WizardStyle, slotHint?: PlayerSlot) {
    const slot: PlayerSlot =
      typeof slotOrStyle === "string"
        ? slotOrStyle
        : slotHint ?? (slotOrStyle.hairStyle === "braid" ? "A" : "B");
    const cfg = WIZARD_CONFIGS[slot];
    this.cfg = cfg;
    this.scene = scene;
    this.texture = cfg.texture;

    this.container = scene.add.container(0, 0);
    this.rig = scene.add.container(0, 0);
    this.container.add(this.rig);

    const texture = scene.textures.get(cfg.texture);
    const source = texture.getSourceImage();
    this.width = source.width;
    this.height = source.height;
    this.baseScale = cfg.targetHeight / Math.max(1, this.height);
    this.px = cfg.targetHeight / 230;
    // Each strip overlaps the next by a pixel so bending never opens a seam.
    for (let i = 0; i < STRIPS; i++) {
      const y0 = Math.floor((i * this.height) / STRIPS);
      const y1 = Math.min(this.height, Math.floor(((i + 1) * this.height) / STRIPS) + 1);
      const name = `strip-${i}`;
      if (!texture.has(name)) texture.add(name, 0, 0, y0, this.width, y1 - y0);
      const strip = scene.add.image(0, 0, cfg.texture, name).setOrigin(0, 0);
      strip.setData("y0", y0);
      this.strips.push(strip);
    }
    this.rig.add(this.strips);

    // Casting node attached to the staff head
    this.castNode = scene.add.container(cfg.staffX, cfg.staffY);
    this.staffGlow = scene.add.circle(0, 0, 14, cfg.orbColor, 0.45).setVisible(false);
    this.castNode.add(this.staffGlow);
    this.rig.add(this.castNode);
  }

  /** Shows a webcam face on the wizard's head, or the drawn face again with null. */
  setFace(textureKey: string | null) {
    if (!textureKey) {
      this.face?.destroy();
      this.face = null;
      return;
    }
    if (!this.face) {
      this.face = this.scene.add.image(0, 0, textureKey);
      this.rig.add(this.face);
    } else {
      this.face.setTexture(textureKey);
    }
    const diameter = this.cfg.face.size * this.width * this.baseScale;
    this.face.setScale(diameter / Math.max(1, this.face.width));
    this.face.setData("base", this.face.scaleX);
  }

  play(action: RigAction, now: number, options: { releaseMs?: number; onRelease?: () => void } = {}) {
    if (this.dying) return;
    this.action = { action, start: now, releaseAt: options.releaseMs ?? null, onRelease: options.onRelease };
  }

  /** Thrown back by a hit: the feet skid, the upper body whips, then the wizard steps back in. Bigger hits throw harder. */
  knockback(damage: number, now: number) {
    if (this.dying) return;
    const force = Math.min(1.6, 0.5 + damage / 25);
    this.slide.velocity -= 420 * force;
    this.lean.velocity -= 7 * force;
    this.trail.velocity -= 4 * force;
    this.squash.velocity -= 2.5 * force;
    this.lift.velocity -= 60 * force;
    this.flashUntil = now + 90;
    this.action = null;
  }

  /** The finishing blow: a stagger, the knees give out, then the body breaks apart into drifting dust. */
  die(now: number, onDone: () => void) {
    if (this.dying) return;
    this.action = null;
    this.dying = { start: now, onDone, shattered: false };
    this.slide.velocity -= 700;
    this.lean.velocity -= 10;
    this.trail.velocity -= 6;
    this.flashUntil = now + 120;
  }

  /** Back on its feet for a rematch. */
  revive() {
    this.dying = null;
    this.rig.setVisible(true).setAlpha(1);
    for (const strip of this.strips) strip.setVisible(true).clearTint();
    this.castNode.setVisible(true);
    for (const spring of [this.slide, this.lift, this.lean, this.trail, this.head]) {
      spring.value = 0;
      spring.velocity = 0;
    }
    this.squash.value = this.widen.value = 1;
  }

  setCheering(cheering: boolean) {
    this.cheering = cheering;
  }

  setCharged(charged: boolean) {
    this.charged = charged;
  }

  /** World position of the casting hand/staff, where thrown spells start. */
  handPoint(): { x: number; y: number } {
    const point = this.castNode.getWorldTransformMatrix().transformPoint(0, 0);
    return { x: point.x, y: point.y };
  }

  update(now: number, delta: number, frozen: boolean) {
    if (frozen && !this.dying) return; // hold current pose while frozen
    const dt = Math.min(delta, 50) / 1000;
    const pose = this.dying ? this.deathPose(now) : this.actionPose(now);
    if (!this.dying) this.addIdle(pose, now);

    const x = this.slide.step(pose.x, dt);
    const y = this.lift.step(pose.y, dt);
    const lean = this.lean.step(pose.lean, dt);
    const trail = this.trail.step(lean, dt);
    const scaleY = this.squash.step(pose.scaleY, dt);
    const scaleX = this.widen.step(pose.scaleX, dt);

    this.rig.setPosition(x * this.px, y * this.px);
    this.bend(lean, lean - trail, this.head.value, scaleX, scaleY, now);

    if (this.charged && !this.dying) {
      this.staffGlow.setVisible(true);
      const pulse = 1 + Math.sin(now / 180) * 0.25;
      this.staffGlow.setScale(pulse);
      this.staffGlow.setAlpha(0.4 + Math.sin(now / 180) * 0.2);
    } else {
      this.staffGlow.setVisible(false);
    }
  }

  /** How far a point at height `h` (0 = feet, 1 = hat tip) shifts sideways for the current bend. */
  private offsetAt(h: number, lean: number, lag: number, head: number) {
    const tall = this.height * this.baseScale;
    return tall * (lean * h ** 1.6 * 0.5 + lag * h ** 3 * 0.35 + head * Math.max(0, h - NECK));
  }

  private bend(lean: number, lag: number, head: number, scaleX: number, scaleY: number, now: number) {
    const s = this.baseScale;
    const left = -this.cfg.originX * this.width * s;
    const flash = now < this.flashUntil;
    for (const strip of this.strips) {
      const y0 = strip.getData("y0") as number;
      const h = 1 - (y0 + strip.height / 2) / this.height;
      // Breathing fills out the chest, not the hem or the hat.
      const chest = Math.max(0, 1 - Math.abs(h - 0.45) / 0.2);
      const sx = scaleX ** chest;
      strip.setScale(s * sx, s * scaleY);
      strip.setPosition(left * sx + this.offsetAt(h, lean, lag, head), (y0 - this.height) * s * scaleY);
      if (flash) strip.setTintFill(0xffffff);
      else if (strip.isTinted) strip.clearTint();
    }
    if (this.face) {
      const { x, y } = this.cfg.face;
      const base = this.face.getData("base") as number;
      this.face.setPosition((x - this.cfg.originX) * this.width * s + this.offsetAt(1 - y, lean, lag, head), (y * this.height - this.height) * s * scaleY);
      this.face.setScale(base, base * scaleY).setRotation(lean * 0.35 + head * 0.5);
      if (flash) this.face.setTintFill(0xffffff);
      else if (this.face.isTinted) this.face.clearTint();
    }
    const staffH = -this.cfg.staffY / (this.height * s);
    this.castNode.setPosition(this.cfg.staffX + this.offsetAt(staffH, lean, lag, head), this.cfg.staffY * scaleY);
  }

  /** Small, unsynchronised motions so a standing wizard looks alive rather than bobbing on a loop. */
  private addIdle(pose: Pose, now: number) {
    if (this.cheering) {
      const hop = Math.abs(Math.sin(now / 180));
      pose.y += -hop * 20;
      pose.lean += Math.sin(now / 180) * 0.12;
      pose.scaleY *= 1 + (hop > 0.1 ? 0.04 : -0.06);
      this.head.step(Math.sin(now / 360) * 0.08, 0.016);
      return;
    }
    // Breathing: chest fills and shoulders rise.
    const breath = Math.sin(now / 650);
    pose.scaleX *= 1 + breath * 0.025;
    pose.scaleY *= 1 + breath * 0.01;
    // Weight shifting from foot to foot.
    const shift = Math.sin(now / 1900) + 0.4 * Math.sin(now / 770);
    pose.x += shift * 2.5;
    pose.lean += -shift * 0.03 + Math.sin(now / 2600) * 0.02;
    // Now and then the head turns to a new spot and settles there.
    if (now >= this.glance.nextAt) {
      this.glance = { target: (Math.random() - 0.4) * 0.14, nextAt: now + 1800 + Math.random() * 3200 };
    }
    this.head.step(this.glance.target, 0.016);
  }

  private actionPose(now: number): Pose {
    const pose = { ...REST };
    if (!this.action) return pose;
    const elapsed = now - this.action.start;
    if (this.action.releaseAt !== null && elapsed >= this.action.releaseAt) {
      this.action.releaseAt = null;
      this.action.onRelease?.();
    }
    switch (this.action.action) {
      case "throw":
        // Wind up back, snap forward through the release, then settle.
        if (elapsed < THROW_WINDUP) {
          const t = elapsed / THROW_WINDUP;
          Object.assign(pose, { x: -12 * t, y: -2 * t, lean: -0.3 * smooth(t), scaleY: 1 - 0.04 * t });
        } else if (elapsed < THROW_WINDUP + 180) {
          const t = (elapsed - THROW_WINDUP) / 180;
          const ease = 1 - (1 - t) ** 2;
          Object.assign(pose, { x: -12 + 30 * ease, y: -2 + 4 * t, lean: -0.3 + 0.6 * ease, scaleY: 0.96 + 0.02 * t });
        } else if (elapsed < THROW_WINDUP + 460) {
          const t = smooth((elapsed - THROW_WINDUP - 180) / 280);
          Object.assign(pose, { x: 18 * (1 - t), lean: 0.3 * (1 - t) });
        } else this.action = null;
        break;
      case "ultimate":
        // Rise up and arch back to call the storm, then drive the staff forward.
        if (elapsed < ULTIMATE_WINDUP) {
          const t = elapsed / ULTIMATE_WINDUP;
          Object.assign(pose, { x: -8 * Math.sin(t * Math.PI), y: -18 * t, lean: -0.4 * smooth(t), scaleY: 1 + 0.06 * t });
        } else if (elapsed < ULTIMATE_WINDUP + 220) {
          const t = (elapsed - ULTIMATE_WINDUP) / 220;
          const ease = 1 - (1 - t) ** 2;
          Object.assign(pose, { x: 22 * ease, y: -18 * (1 - t), lean: -0.4 + 0.8 * ease, scaleX: 1.04, scaleY: 0.94 });
        } else if (elapsed < ULTIMATE_WINDUP + 550) {
          const t = smooth((elapsed - ULTIMATE_WINDUP - 220) / 330);
          Object.assign(pose, { x: 22 * (1 - t), lean: 0.4 * (1 - t), scaleY: 0.94 + 0.06 * t });
        } else this.action = null;
        break;
      case "shield":
        // Brace: crouch a little and lean into the barrier.
        if (elapsed < 650) {
          const t = Math.min(1, elapsed / 140);
          Object.assign(pose, { x: -6 * t, y: 5 * t, lean: 0.12 * t, scaleX: 1 + 0.04 * t, scaleY: 1 - 0.07 * t });
        } else if (elapsed < 850) {
          const t = 1 - smooth((elapsed - 650) / 200);
          Object.assign(pose, { x: -6 * t, y: 5 * t, lean: 0.12 * t, scaleX: 1 + 0.04 * t, scaleY: 1 - 0.07 * t });
        } else this.action = null;
        break;
    }
    return pose;
  }

  private deathPose(now: number): Pose {
    const dying = this.dying!;
    const elapsed = now - dying.start;
    const pose = { ...REST };
    if (elapsed < 450) {
      // Thrown back, arms flung.
      Object.assign(pose, { x: -40, lean: -0.55, scaleY: 1.02 });
    } else if (elapsed < 1000) {
      // Knees give out: slump forward and sink.
      const t = smooth((elapsed - 450) / 550);
      Object.assign(pose, { x: -40 + 8 * t, y: 6 * t, lean: -0.55 + 1.05 * t, scaleY: 1.02 - 0.26 * t, scaleX: 1 + 0.06 * t });
      this.head.step(0.25, 0.016);
    } else {
      Object.assign(pose, { x: -32 + Math.sin(elapsed / 25) * 1.5, y: 6, lean: 0.5, scaleY: 0.76, scaleX: 1.06 });
      if (elapsed > 1150 && !dying.shattered) {
        dying.shattered = true;
        this.shatter(dying.onDone);
      }
    }
    if (elapsed > 1000 && elapsed < 1150) this.flashUntil = now + 16;
    return pose;
  }

  /** Breaks the body into pieces that lift away on the wind, top first, then hands control back. */
  private shatter(onDone: () => void) {
    const scene = this.scene;
    const texture = scene.textures.get(this.texture);
    const s = this.baseScale;
    const scaleX = this.widen.value;
    const scaleY = this.squash.value;
    const lean = this.lean.value;
    const lag = lean - this.trail.value;
    const left = -this.cfg.originX * this.width * s;
    const cellW = this.width / DUST.cols;
    const cellH = this.height / DUST.rows;
    let last = 0;
    for (let row = 0; row < DUST.rows; row++) {
      for (let col = 0; col < DUST.cols; col++) {
        const name = `dust-${row}-${col}`;
        if (!texture.has(name)) texture.add(name, 0, Math.floor(col * cellW), Math.floor(row * cellH), Math.ceil(cellW) + 1, Math.ceil(cellH) + 1);
        const h = 1 - (row + 0.5) / DUST.rows;
        const piece = scene.add.image(0, 0, this.texture, name).setOrigin(0.5).setScale(s * scaleX, s * scaleY);
        piece.setPosition(
          left * scaleX + (col + 0.5) * cellW * s * scaleX + this.offsetAt(h, lean, lag, this.head.value),
          (row * cellH + cellH / 2 - this.height) * s * scaleY,
        );
        this.rig.add(piece);
        // The top crumbles first and the wind carries everything back and up.
        const delay = row * 45 + Math.random() * 160;
        const duration = 700 + Math.random() * 500;
        last = Math.max(last, delay + duration);
        scene.tweens.add({
          targets: piece,
          x: piece.x - (60 + Math.random() * 140) * this.px,
          y: piece.y - (50 + Math.random() * 120) * this.px,
          angle: (Math.random() - 0.5) * 240,
          scale: piece.scaleX * 0.2,
          alpha: 0,
          delay,
          duration,
          ease: "Quad.easeIn",
          onComplete: () => piece.destroy(),
        });
      }
    }
    for (const strip of this.strips) strip.setVisible(false);
    this.castNode.setVisible(false);
    scene.time.delayedCall(Math.min(last, 900), onDone);
  }
}
