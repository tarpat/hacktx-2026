import Phaser from "phaser";
import type { SpellId } from "@spellcaster/shared";
import { palette } from "../theme";

/**
 * Joint angles in degrees. Positive means "toward the opponent" (forward). Arm and leg
 * angles are measured from hanging straight down; forearm and shin angles are the bend
 * relative to their parent segment.
 */
interface Pose {
  lean: number;
  hipY: number;
  head: number;
  frontThigh: number;
  frontShin: number;
  backThigh: number;
  backShin: number;
  frontUpper: number;
  frontFore: number;
  backUpper: number;
  backFore: number;
  /** 0 hides the spell gathering in the casting hand, 1 is full size. */
  orb: number;
}

type PoseKey = keyof Pose;
const KEYS: PoseKey[] = ["lean", "hipY", "head", "frontThigh", "frontShin", "backThigh", "backShin", "frontUpper", "frontFore", "backUpper", "backFore", "orb"];

const IDLE: Pose = {
  lean: 0, hipY: 0, head: 0,
  frontThigh: 6, frontShin: -4, backThigh: -6, backShin: 4,
  frontUpper: 18, frontFore: 28, backUpper: 12, backFore: 42, orb: 0,
};

const pose = (overrides: Partial<Pose>): Pose => ({ ...IDLE, ...overrides });

interface Keyframe {
  at: number;
  pose: Pose;
}

export type RigAction = "throw" | "ultimate" | "shield" | "hit";

/** Milliseconds from the start of a cast animation to the moment the spell leaves the hand. */
export const RELEASE_MS: Record<Exclude<SpellId, "shield">, number> = { fireball: 340, ice: 340, ultimate: 500, sixSeven: 500 };

// Gather the spell at the chest, coil back with the front knee up, whip the arm through as
// the front foot plants, follow through, then settle back to idle.
const THROW: Keyframe[] = [
  { at: 0, pose: IDLE },
  { at: 130, pose: pose({ lean: 5, hipY: 4, head: 6, frontThigh: 12, frontShin: -10, backThigh: -10, backShin: 10, frontUpper: 42, frontFore: 95, backUpper: 38, backFore: 92, orb: 0.6 }) },
  { at: 270, pose: pose({ lean: -13, hipY: 3, head: -6, frontThigh: 34, frontShin: -55, backThigh: -4, backShin: 12, frontUpper: -150, frontFore: 45, backUpper: 62, backFore: 20, orb: 1 }) },
  { at: 340, pose: pose({ lean: 18, hipY: 9, head: 10, frontThigh: 30, frontShin: 8, backThigh: -26, backShin: 22, frontUpper: 105, frontFore: 8, backUpper: -28, backFore: 48, orb: 0 }) },
  { at: 580, pose: pose({ lean: 22, hipY: 8, head: 8, frontThigh: 28, frontShin: 6, backThigh: -24, backShin: 26, frontUpper: 40, frontFore: 34, backUpper: -40, backFore: 40, orb: 0 }) },
  { at: 950, pose: IDLE },
];

// Both arms rise overhead to build a big charge, then a two-handed overhead throw.
const ULTIMATE: Keyframe[] = [
  { at: 0, pose: IDLE },
  { at: 220, pose: pose({ lean: -8, hipY: 5, head: -14, frontThigh: 14, frontShin: -12, backThigh: -12, backShin: 12, frontUpper: 168, frontFore: 12, backUpper: 160, backFore: 18, orb: 0.8 }) },
  { at: 430, pose: pose({ lean: -16, hipY: 3, head: -18, frontThigh: 36, frontShin: -58, backThigh: -4, backShin: 14, frontUpper: 196, frontFore: 18, backUpper: 188, backFore: 22, orb: 1.3 }) },
  { at: 500, pose: pose({ lean: 26, hipY: 11, head: 14, frontThigh: 32, frontShin: 10, backThigh: -28, backShin: 24, frontUpper: 98, frontFore: 4, backUpper: 92, backFore: 8, orb: 0 }) },
  { at: 800, pose: pose({ lean: 24, hipY: 9, head: 10, frontThigh: 30, frontShin: 8, backThigh: -26, backShin: 26, frontUpper: 55, frontFore: 24, backUpper: 48, backFore: 30, orb: 0 }) },
  { at: 1200, pose: IDLE },
];

// Brace with both palms pushed forward, hold through the guard window, then relax.
const SHIELD: Keyframe[] = [
  { at: 0, pose: IDLE },
  { at: 140, pose: pose({ lean: -7, hipY: 6, head: -4, frontThigh: 20, frontShin: -12, backThigh: -18, backShin: 12, frontUpper: 88, frontFore: 6, backUpper: 70, backFore: 26 }) },
  { at: 700, pose: pose({ lean: -5, hipY: 5, head: -2, frontThigh: 18, frontShin: -10, backThigh: -16, backShin: 10, frontUpper: 84, frontFore: 10, backUpper: 66, backFore: 30 }) },
  { at: 1000, pose: IDLE },
];

// Head snaps back, arms fly out, a short stagger, then recover.
const HIT: Keyframe[] = [
  { at: 0, pose: IDLE },
  { at: 80, pose: pose({ lean: -22, hipY: 3, head: -20, frontThigh: -4, frontShin: 6, backThigh: -18, backShin: 16, frontUpper: 62, frontFore: -10, backUpper: -48, backFore: 20 }) },
  { at: 220, pose: pose({ lean: -10, hipY: 6, head: -8, frontThigh: 4, frontShin: -6, backThigh: -14, backShin: 18, frontUpper: 34, frontFore: 20, backUpper: -14, backFore: 38 }) },
  { at: 520, pose: IDLE },
];

const ACTIONS: Record<RigAction, Keyframe[]> = { throw: THROW, ultimate: ULTIMATE, shield: SHIELD, hit: HIT };

const smooth = (t: number) => t * t * (3 - 2 * t);
const rad = (deg: number) => (-deg * Math.PI) / 180;

function sample(frames: Keyframe[], elapsed: number): Pose {
  const last = frames[frames.length - 1];
  if (elapsed >= last.at) return last.pose;
  const next = frames.findIndex((frame) => frame.at > elapsed);
  const a = frames[next - 1];
  const b = frames[next];
  const t = smooth((elapsed - a.at) / (b.at - a.at));
  const out = {} as Pose;
  for (const key of KEYS) out[key] = a.pose[key] + (b.pose[key] - a.pose[key]) * t;
  return out;
}

export interface WizardStyle {
  robe: number;
  trim: number;
  hat: number;
  hatBand: number;
  skin: number;
  hair: number;
  hairStyle: "braid" | "curls";
  /** Starry cape behind the body, if any. */
  cape?: number;
  /** Staff orb or crystal color. */
  orb: number;
}

interface Limb {
  upper: Phaser.GameObjects.Container;
  lower: Phaser.GameObjects.Container;
}

/**
 * A jointed, procedurally animated wizard drawn facing right. Mirror it with the parent's
 * scaleX for the opponent. Poses ease between keyframes and are smoothed every frame so
 * one action can interrupt another without popping.
 */
export class WizardRig {
  readonly container: Phaser.GameObjects.Container;
  private readonly hips: Phaser.GameObjects.Container;
  private readonly torso: Phaser.GameObjects.Container;
  private readonly head: Phaser.GameObjects.Container;
  private readonly hat: Phaser.GameObjects.Container;
  private readonly frontArm: Limb;
  private readonly backArm: Limb;
  private readonly frontLeg: Limb;
  private readonly backLeg: Limb;
  private readonly staff: Phaser.GameObjects.Container;
  private readonly staffOrb: Phaser.GameObjects.Shape;
  private readonly backHair: Phaser.GameObjects.Container;
  private readonly castOrb: Phaser.GameObjects.Container;
  private readonly castOrbCore: Phaser.GameObjects.Arc;
  private readonly castOrbGlow: Phaser.GameObjects.Arc;

  private current: Pose = { ...IDLE };
  private action: { frames: Keyframe[]; start: number; releaseAt: number | null; onRelease?: () => void } | null = null;
  private cheering = false;
  private hatAngle = 0;
  private hatVelocity = 0;
  private lastLean = 0;

  constructor(scene: Phaser.Scene, private readonly style: WizardStyle) {
    const { robe, trim, hat: hatColor, hatBand, skin, hair } = style;
    const robeDark = Phaser.Display.Color.ValueToColor(robe).darken(14).color;
    const V = (x: number, y: number) => new Phaser.Math.Vector2(x, y);

    this.container = scene.add.container(0, 0);
    this.hips = scene.add.container(0, -62);
    this.backLeg = this.makeLeg(scene, -7, Phaser.Display.Color.ValueToColor(robe).darken(32).color);
    this.frontLeg = this.makeLeg(scene, 7, Phaser.Display.Color.ValueToColor(robe).darken(24).color);
    this.torso = scene.add.container(0, 0);

    // Behind the body: the cape and the long hair hang from the shoulders and head.
    const behind: Phaser.GameObjects.GameObject[] = [];
    if (style.cape !== undefined) {
      const cape = scene.add.graphics();
      cape.fillStyle(style.cape, 1);
      cape.fillPoints([V(-14, -58), V(14, -58), V(10, 44), V(-62, 50), V(-50, 10)], true);
      cape.fillStyle(palette.gold, 1);
      for (const [x, y, r] of [[-30, 20, 2.6], [-46, 38, 2.2], [-14, 30, 2], [-36, -6, 1.8], [-20, 2, 2.4], [-54, 22, 1.8]]) cape.fillCircle(x, y, r);
      behind.push(cape);
    }
    this.backHair = scene.add.container(0, -60);
    const hairGfx = scene.add.graphics();
    if (style.hairStyle === "braid") {
      // A long golden braid down the back, woven with tiny flowers.
      const shade = Phaser.Display.Color.ValueToColor(hair).darken(18).color;
      for (let i = 0; i < 9; i += 1) {
        const y = -8 + i * 13;
        hairGfx.fillStyle(i % 2 ? shade : hair, 1);
        hairGfx.fillEllipse(-15 - i * 1.6, y, 15 - i * 0.4, 16);
        if (i % 3 === 1) {
          hairGfx.fillStyle(i % 2 ? 0xb28ddb : 0xffffff, 1);
          hairGfx.fillCircle(-12 - i * 1.6, y, 2.4);
        }
      }
      hairGfx.fillStyle(0x7ccf6b, 1);
      hairGfx.fillRect(-36, 106, 10, 5);
      hairGfx.fillStyle(hair, 1);
      hairGfx.fillTriangle(-40, 110, -22, 110, -34, 132);
    } else {
      // Black curls framing the face and falling past the shoulders.
      hairGfx.fillStyle(hair, 1);
      for (const [x, y, r] of [[-14, -22, 15], [-20, -6, 14], [-22, 10, 13], [-18, 26, 12], [-10, 38, 10], [-2, -34, 11], [10, -36, 9], [-24, 40, 9]]) hairGfx.fillCircle(x, y, r);
    }
    this.backHair.add(hairGfx);
    behind.push(this.backHair);

    this.backArm = this.makeArm(scene, -5, robeDark, trim);
    this.staff = scene.add.container(0, 26);
    const staffGfx = scene.add.graphics();
    staffGfx.lineStyle(6, 0x7a4e30, 1);
    staffGfx.lineBetween(0, 42, 0, -94);
    staffGfx.lineStyle(2, 0x7ccf6b, 1);
    for (let y = -80; y < 30; y += 22) staffGfx.lineBetween(-3, y, 3, y + 9); // vine wrap
    const staffGlow = scene.add.circle(0, -106, 20, style.orb, 0.25);
    scene.tweens.add({ targets: staffGlow, scale: 1.4, alpha: 0.05, duration: 900, yoyo: true, repeat: -1 });
    if (style.hairStyle === "braid") {
      staffGfx.lineStyle(4, 0x7a4e30, 1);
      staffGfx.strokeCircle(0, -106, 13); // twisted wooden cradle
      this.staffOrb = scene.add.circle(0, -106, 9, style.orb, 1);
    } else {
      staffGfx.lineStyle(2, palette.gold, 1);
      staffGfx.strokeRect(-9, -122, 18, 30); // gold cage
      this.staffOrb = scene.add.star(0, -107, 4, 5, 15, style.orb, 1);
    }
    this.staff.add([staffGfx, staffGlow, this.staffOrb]);
    this.backArm.lower.add(this.staff);

    const robeGfx = scene.add.graphics();
    robeGfx.fillStyle(robe, 1);
    robeGfx.fillPoints([V(-17, -60), V(17, -60), V(44, 38), V(-44, 38)], true);
    robeGfx.fillStyle(robeDark, 1);
    robeGfx.fillPoints([V(-3, -50), V(5, -50), V(14, 38), V(-6, 38)], true); // front panel
    robeGfx.fillStyle(trim, 1);
    robeGfx.fillPoints([V(-42, 30), V(42, 30), V(44, 38), V(-44, 38)], true);
    robeGfx.fillRect(-23, -14, 46, 5); // belt
    robeGfx.fillStyle(palette.gold, 1);
    robeGfx.fillCircle(6, -40, 4); // sun / moon clasp
    robeGfx.fillStyle(trim, 1);
    robeGfx.fillTriangle(-12, -60, 12, -60, 0, -46); // collar

    this.head = scene.add.container(0, -60);
    const face = scene.add.graphics();
    face.fillStyle(skin, 1);
    face.fillCircle(3, -18, 18);
    face.fillStyle(0xff9fb0, 0.5);
    face.fillCircle(12, -11, 4.5); // blush
    face.fillStyle(0x2a1a3a, 1);
    face.fillEllipse(12, -21, 5, 7); // eye
    face.fillStyle(0xffffff, 1);
    face.fillCircle(13, -23, 1.4);
    face.lineStyle(2, 0x2a1a3a, 1);
    face.lineBetween(8, -27, 16, -28); // brow
    face.lineStyle(2, 0xb5485f, 1);
    face.beginPath();
    face.arc(13, -11, 5, 0.3, 1.5);
    face.strokePath(); // smile
    face.fillStyle(hair, 1);
    if (style.hairStyle === "braid") {
      face.fillEllipse(-4, -30, 34, 16); // fringe swept under the hat
      face.fillEllipse(-10, -16, 14, 30);
    } else {
      face.fillCircle(-6, -30, 12);
      face.fillCircle(-12, -16, 11);
      face.fillCircle(16, -32, 7);
    }

    this.hat = scene.add.container(0, -32);
    const hatGfx = scene.add.graphics();
    hatGfx.fillStyle(hatColor, 1);
    if (style.hairStyle === "braid") {
      // Floppy hat whose tip curls back.
      hatGfx.fillPoints([V(-28, -2), V(28, -2), V(6, -60), V(-18, -84), V(-34, -70), V(-20, -62)], true);
    } else {
      hatGfx.fillTriangle(-28, -2, 30, -2, -10, -96); // tall straight hat
    }
    hatGfx.fillEllipse(0, 0, 86, 14);
    hatGfx.fillStyle(hatBand, 1);
    hatGfx.fillRect(-24, -10, 50, 7);
    if (style.hairStyle === "braid") {
      hatGfx.fillStyle(0xb28ddb, 1);
      for (const [dx, dy] of [[0, -4], [4, 0], [0, 4], [-4, 0]]) hatGfx.fillCircle(16 + dx, -7 + dy, 3); // flower
      hatGfx.fillStyle(palette.gold, 1);
      hatGfx.fillCircle(16, -7, 2);
    } else {
      hatGfx.lineStyle(1.5, palette.gold, 1);
      hatGfx.lineBetween(-10, -96, -16, -78);
      hatGfx.fillStyle(palette.gold, 1);
      hatGfx.fillCircle(-17, -74, 5); // moon charm
      hatGfx.fillStyle(hatColor, 1);
      hatGfx.fillCircle(-14, -76, 4);
    }
    this.hat.add(hatGfx);
    this.head.add([face, this.hat]);

    this.frontArm = this.makeArm(scene, 6, robe, trim);
    this.castOrb = scene.add.container(0, 32);
    this.castOrbGlow = scene.add.circle(0, 0, 20, palette.gold, 0.3);
    this.castOrbCore = scene.add.circle(0, 0, 10, palette.gold, 1);
    this.castOrb.add([this.castOrbGlow, this.castOrbCore, scene.add.circle(0, 0, 4, 0xffffff, 0.9)]);
    this.castOrb.setScale(0);
    this.frontArm.lower.add(this.castOrb);

    // The staff arm sits over the robe so the staff stays visible; the throwing arm is front-most.
    this.torso.add([...behind, robeGfx, this.backArm.upper, this.head, this.frontArm.upper]);
    this.hips.add([this.backLeg.upper, this.frontLeg.upper, this.torso]);
    this.container.add(this.hips);
  }

  play(action: RigAction, now: number, options: { color?: number; releaseMs?: number; onRelease?: () => void } = {}) {
    if (options.color !== undefined) {
      this.castOrbCore.setFillStyle(options.color);
      this.castOrbGlow.setFillStyle(options.color, 0.3);
    }
    this.action = { frames: ACTIONS[action], start: now, releaseAt: options.releaseMs ?? null, onRelease: options.onRelease };
  }

  setCheering(cheering: boolean) {
    this.cheering = cheering;
  }

  setCharged(charged: boolean) {
    this.staffOrb.setFillStyle(charged ? 0xffffff : this.style.orb);
  }

  /** World position of the casting hand, where thrown spells start. */
  handPoint(): { x: number; y: number } {
    const point = this.frontArm.lower.getWorldTransformMatrix().transformPoint(0, 32);
    return { x: point.x, y: point.y };
  }

  update(now: number, delta: number, frozen: boolean) {
    if (frozen) return; // hold the pose inside the ice

    let target: Pose;
    if (this.action) {
      const elapsed = now - this.action.start;
      target = sample(this.action.frames, elapsed);
      if (this.action.releaseAt !== null && elapsed >= this.action.releaseAt) {
        this.action.releaseAt = null;
        this.action.onRelease?.();
      }
      if (elapsed >= this.action.frames[this.action.frames.length - 1].at) this.action = null;
    } else if (this.cheering) {
      const wave = Math.sin(now / 160);
      const hop = Math.abs(Math.sin(now / 260));
      target = pose({ lean: -4, hipY: -hop * 18, head: -10 + wave * 4, frontUpper: 160 + wave * 14, frontFore: 10, backUpper: 150 - wave * 10, backFore: 20, frontThigh: 10 + hop * 14, frontShin: -hop * 20, backThigh: -10 - hop * 6, backShin: hop * 16 });
    } else {
      target = { ...IDLE };
    }

    // Gentle breathing and weight shift layered on top of every pose.
    const breath = Math.sin(now / 650);
    target.lean += breath * 1.5;
    target.hipY += (breath + 1) * 1.2;
    target.head += Math.sin(now / 650 + 1.2) * 2.5;
    target.frontUpper += Math.sin(now / 820) * 3;
    target.backUpper += Math.sin(now / 820 + 2) * 3;

    const blend = 1 - Math.exp(-delta / 30);
    for (const key of KEYS) this.current[key] += (target[key] - this.current[key]) * blend;
    this.apply(delta);
  }

  private apply(delta: number) {
    const p = this.current;
    this.hips.y = -62 + p.hipY;
    this.torso.rotation = rad(p.lean);
    this.head.rotation = rad(p.head);
    this.backHair.rotation = rad(p.head * 0.6);
    this.frontLeg.upper.rotation = rad(p.frontThigh);
    this.frontLeg.lower.rotation = rad(p.frontShin);
    this.backLeg.upper.rotation = rad(p.backThigh);
    this.backLeg.lower.rotation = rad(p.backShin);
    this.frontArm.upper.rotation = rad(p.frontUpper);
    this.frontArm.lower.rotation = rad(p.frontFore);
    this.backArm.upper.rotation = rad(p.backUpper);
    this.backArm.lower.rotation = rad(p.backFore);
    // Keep the staff close to upright in the hand whatever the arm is doing.
    this.staff.rotation = -rad(p.lean + p.backUpper + p.backFore) + rad(6);
    this.castOrb.setScale(Math.max(0, p.orb));
    this.castOrb.rotation += delta / 120;

    // The floppy hat lags behind the body on a damped spring.
    const seconds = Math.max(1, Math.min(delta, 50)) / 1000;
    const swing = p.lean + p.head;
    const angularSpeed = (swing - this.lastLean) / seconds;
    this.lastLean = swing;
    const lagTarget = Phaser.Math.Clamp(-angularSpeed * 0.08, -25, 25);
    this.hatVelocity += ((lagTarget - this.hatAngle) * 160 - this.hatVelocity * 11) * seconds;
    this.hatAngle += this.hatVelocity * seconds;
    this.hat.rotation = rad(this.hatAngle);
    // Long hair swings with the same lag as the hat.
    this.backHair.rotation += rad(this.hatAngle * 0.5);
  }

  private makeArm(scene: Phaser.Scene, shoulderX: number, sleeve: number, cuff: number): Limb {
    const upper = scene.add.container(shoulderX, -50);
    const upperGfx = scene.add.graphics();
    upperGfx.fillStyle(sleeve, 1);
    upperGfx.fillRoundedRect(-7, -4, 14, 32, 6);
    const lower = scene.add.container(0, 26);
    const lowerGfx = scene.add.graphics();
    lowerGfx.fillStyle(sleeve, 1);
    lowerGfx.fillRoundedRect(-8, -3, 16, 26, 6);
    lowerGfx.fillStyle(cuff, 1);
    lowerGfx.fillRect(-9, 18, 18, 4); // sleeve cuff
    lowerGfx.fillStyle(this.style.skin, 1);
    lowerGfx.fillCircle(0, 27, 6.5);
    lower.add(lowerGfx);
    upper.add([upperGfx, lower]);
    return { upper, lower };
  }

  private makeLeg(scene: Phaser.Scene, hipX: number, color: number): Limb {
    const upper = scene.add.container(hipX, 0);
    const thigh = scene.add.graphics();
    thigh.fillStyle(color, 1);
    thigh.fillRoundedRect(-6, -2, 12, 36, 5);
    const lower = scene.add.container(0, 32);
    const shin = scene.add.graphics();
    shin.fillStyle(color, 1);
    shin.fillRoundedRect(-5, -2, 10, 28, 4);
    shin.fillStyle(0x3b2a20, 1);
    shin.fillEllipse(5, 28, 22, 10); // boot, toe pointing forward
    lower.add(shin);
    upper.add([thigh, lower]);
    return { upper, lower };
  }
}
