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
export const RELEASE_MS: Record<Exclude<SpellId, "shield">, number> = { fireball: 340, ice: 340, ultimate: 500 };

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
  private readonly staffOrb: Phaser.GameObjects.Arc;
  private readonly castOrb: Phaser.GameObjects.Container;
  private readonly castOrbCore: Phaser.GameObjects.Arc;
  private readonly castOrbGlow: Phaser.GameObjects.Arc;

  private current: Pose = { ...IDLE };
  private action: { frames: Keyframe[]; start: number; releaseAt: number | null; onRelease?: () => void } | null = null;
  private cheering = false;
  private hatAngle = 0;
  private hatVelocity = 0;
  private lastLean = 0;

  constructor(scene: Phaser.Scene, robe: number) {
    const robeDark = Phaser.Display.Color.ValueToColor(robe).darken(22).color;
    const hatColor = Phaser.Display.Color.ValueToColor(robe).darken(30).color;

    this.container = scene.add.container(0, 0);
    this.hips = scene.add.container(0, -62);
    this.backLeg = this.makeLeg(scene, -7, 0x3a2a5c);
    this.frontLeg = this.makeLeg(scene, 7, 0x4a3670);
    this.torso = scene.add.container(0, 0);

    this.backArm = this.makeArm(scene, -5, robeDark);
    this.staff = scene.add.container(0, 26);
    const staffGfx = scene.add.graphics();
    staffGfx.lineStyle(6, 0x8a5a3c, 1);
    staffGfx.lineBetween(0, 42, 0, -96);
    staffGfx.fillStyle(palette.gold, 1);
    staffGfx.fillRect(-5, -96, 10, 5);
    const staffGlow = scene.add.circle(0, -106, 20, palette.gold, 0.25);
    this.staffOrb = scene.add.circle(0, -106, 10, palette.gold, 1);
    scene.tweens.add({ targets: staffGlow, scale: 1.4, alpha: 0.05, duration: 900, yoyo: true, repeat: -1 });
    this.staff.add([staffGfx, staffGlow, this.staffOrb]);
    this.backArm.lower.add(this.staff);

    const robeGfx = scene.add.graphics();
    robeGfx.fillStyle(robe, 1);
    robeGfx.fillPoints([new Phaser.Math.Vector2(-17, -60), new Phaser.Math.Vector2(17, -60), new Phaser.Math.Vector2(44, 38), new Phaser.Math.Vector2(-44, 38)], true);
    robeGfx.fillStyle(palette.gold, 1);
    robeGfx.fillPoints([new Phaser.Math.Vector2(-42, 30), new Phaser.Math.Vector2(42, 30), new Phaser.Math.Vector2(44, 38), new Phaser.Math.Vector2(-44, 38)], true);
    robeGfx.fillRect(-23, -14, 46, 6); // belt
    robeGfx.fillStyle(robeDark, 1);
    robeGfx.fillTriangle(-12, -60, 12, -60, 0, -44); // collar

    this.head = scene.add.container(0, -60);
    const face = scene.add.graphics();
    face.fillStyle(palette.parchment, 1);
    face.fillCircle(2, -18, 19);
    face.fillStyle(palette.rose, 0.45);
    face.fillCircle(11, -12, 4);
    face.fillStyle(0xf7f1ff, 1);
    face.fillTriangle(-12, -8, 18, -8, 7, 26); // beard
    face.fillStyle(palette.night, 1);
    face.fillCircle(10, -22, 3); // eye
    face.fillStyle(0xf3d9c0, 1);
    face.fillCircle(19, -16, 4); // nose
    this.hat = scene.add.container(0, -32);
    const hatGfx = scene.add.graphics();
    hatGfx.fillStyle(hatColor, 1);
    hatGfx.fillTriangle(-30, -2, 30, -2, -22, -88);
    hatGfx.fillEllipse(0, 0, 82, 13);
    hatGfx.fillStyle(palette.gold, 1);
    hatGfx.fillCircle(-6, -40, 5);
    this.hat.add(hatGfx);
    this.head.add([face, this.hat]);

    this.frontArm = this.makeArm(scene, 6, robe);
    this.castOrb = scene.add.container(0, 32);
    this.castOrbGlow = scene.add.circle(0, 0, 20, palette.gold, 0.3);
    this.castOrbCore = scene.add.circle(0, 0, 10, palette.gold, 1);
    this.castOrb.add([this.castOrbGlow, this.castOrbCore, scene.add.circle(0, 0, 4, 0xffffff, 0.9)]);
    this.castOrb.setScale(0);
    this.frontArm.lower.add(this.castOrb);

    // The staff arm sits over the robe so the staff stays visible; the throwing arm is front-most.
    this.torso.add([robeGfx, this.backArm.upper, this.head, this.frontArm.upper]);
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
    this.staffOrb.setFillStyle(charged ? 0xffffff : palette.gold);
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
  }

  private makeArm(scene: Phaser.Scene, shoulderX: number, sleeve: number): Limb {
    const upper = scene.add.container(shoulderX, -50);
    const upperGfx = scene.add.graphics();
    upperGfx.fillStyle(sleeve, 1);
    upperGfx.fillRoundedRect(-7, -4, 14, 32, 6);
    const lower = scene.add.container(0, 26);
    const lowerGfx = scene.add.graphics();
    lowerGfx.fillStyle(sleeve, 1);
    lowerGfx.fillRoundedRect(-7, -3, 14, 26, 6);
    lowerGfx.fillStyle(palette.parchment, 1);
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
    shin.fillStyle(0x5a3a28, 1);
    shin.fillEllipse(5, 28, 22, 10); // boot, toe pointing forward
    lower.add(shin);
    upper.add([thigh, lower]);
    return { upper, lower };
  }
}
