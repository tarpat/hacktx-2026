import Phaser from "phaser";
import type { PlayerSlot, SpellId } from "@spellcaster/shared";
import { palette } from "../theme";

export type RigAction = "throw" | "ultimate" | "shield" | "hit";

/** Milliseconds from the start of a cast animation to the moment the spell leaves the hand. */
export const RELEASE_MS: Record<Exclude<SpellId, "shield">, number> = { fireball: 340, ice: 340, ultimate: 500 };

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
}

const WIZARD_CONFIGS: Record<PlayerSlot, WizardConfig> = {
  A: {
    texture: "wizard-green",
    targetHeight: 230,
    originX: 0.444,
    originY: 1.0,
    staffX: 93,
    staffY: -151,
    orbColor: 0xffe27a,
  },
  B: {
    texture: "wizard-purple",
    targetHeight: 250,
    originX: 0.395,
    originY: 1.0,
    staffX: 79,
    staffY: -162,
    orbColor: 0xc9a8f0,
  },
};

interface Pose {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  orbScale: number;
}

const IDLE: Pose = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, orbScale: 0 };

export class WizardRig {
  readonly container: Phaser.GameObjects.Container;
  private readonly rig: Phaser.GameObjects.Container;
  readonly sprite: Phaser.GameObjects.Image;
  private readonly castNode: Phaser.GameObjects.Container;
  private readonly castOrb: Phaser.GameObjects.Container;
  private readonly castOrbCore: Phaser.GameObjects.Arc;
  private readonly castOrbGlow: Phaser.GameObjects.Arc;
  private readonly staffGlow: Phaser.GameObjects.Arc;

  private readonly baseScale: number;
  private current: Pose = { ...IDLE };
  private action: { action: RigAction; start: number; releaseAt: number | null; onRelease?: () => void } | null = null;
  private cheering = false;
  private charged = false;

  constructor(scene: Phaser.Scene, slotOrStyle: PlayerSlot | WizardStyle, slotHint?: PlayerSlot) {
    const slot: PlayerSlot =
      typeof slotOrStyle === "string"
        ? slotOrStyle
        : slotHint ?? (slotOrStyle.hairStyle === "braid" ? "A" : "B");
    const cfg = WIZARD_CONFIGS[slot];

    this.container = scene.add.container(0, 0);
    this.rig = scene.add.container(0, 0);
    this.container.add(this.rig);

    this.sprite = scene.add.image(0, 0, cfg.texture);
    this.sprite.setOrigin(cfg.originX, cfg.originY);
    this.baseScale = cfg.targetHeight / Math.max(1, this.sprite.height);
    this.sprite.setScale(this.baseScale);
    this.rig.add(this.sprite);

    // Casting node attached to the staff head
    this.castNode = scene.add.container(cfg.staffX, cfg.staffY);
    this.staffGlow = scene.add.circle(0, 0, 24, cfg.orbColor, 0.45).setVisible(false);

    this.castOrb = scene.add.container(0, 0);
    this.castOrbGlow = scene.add.circle(0, 0, 22, palette.gold, 0.3);
    this.castOrbCore = scene.add.circle(0, 0, 11, palette.gold, 1);
    this.castOrb.add([this.castOrbGlow, this.castOrbCore, scene.add.circle(0, 0, 4, 0xffffff, 0.9)]);
    this.castOrb.setScale(0);

    this.castNode.add([this.staffGlow, this.castOrb]);
    this.rig.add(this.castNode);
  }

  play(action: RigAction, now: number, options: { color?: number; releaseMs?: number; onRelease?: () => void } = {}) {
    if (options.color !== undefined) {
      this.castOrbCore.setFillStyle(options.color);
      this.castOrbGlow.setFillStyle(options.color, 0.35);
    }
    this.action = { action, start: now, releaseAt: options.releaseMs ?? null, onRelease: options.onRelease };
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
    if (frozen) return; // hold current pose while frozen

    let targetX = 0;
    let targetY = 0;
    let targetRot = 0;
    let targetScaleX = 1;
    let targetScaleY = 1;
    let targetOrb = 0;

    if (this.action) {
      const elapsed = now - this.action.start;
      if (this.action.releaseAt !== null && elapsed >= this.action.releaseAt) {
        this.action.releaseAt = null;
        this.action.onRelease?.();
      }

      switch (this.action.action) {
        case "throw": {
          if (elapsed < 340) {
            const t = elapsed / 340;
            targetX = -14 * t;
            targetY = -3 * t;
            targetRot = -0.12 * t;
            targetScaleY = 1 - 0.05 * t;
            targetScaleX = 1 + 0.02 * t;
            targetOrb = t * 1.1;
          } else if (elapsed < 500) {
            const t = (elapsed - 340) / 160;
            const ease = 1 - Math.pow(1 - t, 2);
            targetX = -14 + 32 * ease;
            targetY = -3 + 6 * t;
            targetRot = -0.12 + 0.22 * ease;
            targetScaleX = 1.04 - 0.02 * t;
            targetScaleY = 0.95 + 0.03 * t;
            targetOrb = Math.max(0, 1 - t * 3);
          } else if (elapsed < 750) {
            const t = (elapsed - 500) / 250;
            const ease = t * t * (3 - 2 * t);
            targetX = 18 * (1 - ease);
            targetY = 3 * (1 - ease);
            targetRot = 0.1 * (1 - ease);
            targetScaleX = 1.02 * (1 - ease) + ease;
            targetScaleY = 0.98 * (1 - ease) + ease;
            targetOrb = 0;
          } else {
            this.action = null;
          }
          break;
        }
        case "ultimate": {
          if (elapsed < 500) {
            const t = elapsed / 500;
            targetX = -10 * Math.sin(t * Math.PI);
            targetY = -18 * t;
            targetRot = -0.16 * t;
            targetScaleY = 1 + 0.05 * Math.sin(t * Math.PI * 4);
            targetOrb = t * 1.4;
          } else if (elapsed < 700) {
            const t = (elapsed - 500) / 200;
            const ease = 1 - Math.pow(1 - t, 2);
            targetX = 22 * ease;
            targetY = -18 * (1 - t);
            targetRot = -0.16 + 0.28 * ease;
            targetScaleX = 1.06;
            targetScaleY = 0.94;
            targetOrb = 0;
          } else if (elapsed < 1000) {
            const t = (elapsed - 700) / 300;
            const ease = t * t * (3 - 2 * t);
            targetX = 22 * (1 - ease);
            targetRot = 0.12 * (1 - ease);
            targetScaleX = 1.06 * (1 - ease) + ease;
            targetScaleY = 0.94 * (1 - ease) + ease;
          } else {
            this.action = null;
          }
          break;
        }
        case "shield": {
          if (elapsed < 140) {
            const t = elapsed / 140;
            targetX = -8 * t;
            targetY = 4 * t;
            targetScaleY = 1 - 0.06 * t;
            targetScaleX = 1 + 0.04 * t;
            targetRot = -0.05 * t;
          } else if (elapsed < 650) {
            targetX = -8;
            targetY = 4;
            targetScaleY = 0.94;
            targetScaleX = 1.04;
            targetRot = -0.05;
          } else if (elapsed < 850) {
            const t = (elapsed - 650) / 200;
            const ease = t * t * (3 - 2 * t);
            targetX = -8 * (1 - ease);
            targetY = 4 * (1 - ease);
            targetScaleY = 0.94 * (1 - ease) + ease;
            targetScaleX = 1.04 * (1 - ease) + ease;
            targetRot = -0.05 * (1 - ease);
          } else {
            this.action = null;
          }
          break;
        }
        case "hit": {
          if (elapsed < 90) {
            const t = elapsed / 90;
            targetX = -18 * t;
            targetY = -4 * t;
            targetRot = -0.16 * t;
          } else if (elapsed < 240) {
            const t = (elapsed - 90) / 150;
            targetX = -18 + 10 * t;
            targetY = -4 + 4 * t;
            targetRot = -0.16 + 0.08 * t;
          } else if (elapsed < 450) {
            const t = (elapsed - 240) / 210;
            const ease = t * t * (3 - 2 * t);
            targetX = -8 * (1 - ease);
            targetRot = -0.08 * (1 - ease);
          } else {
            this.action = null;
          }
          break;
        }
      }
    }

    if (this.cheering) {
      const hop = Math.abs(Math.sin(now / 180));
      targetY += -hop * 20;
      targetRot += Math.sin(now / 180) * 0.06;
      targetScaleY *= 1 + (hop > 0.1 ? 0.04 : -0.04);
    } else {
      const breath = Math.sin(now / 600);
      targetY += (breath + 1) * 1.5;
      targetScaleY *= 1 + breath * 0.015;
      targetScaleX *= 1 - breath * 0.01;
      targetRot += Math.sin(now / 1200) * 0.012;
    }

    // Smooth easing
    const blend = 1 - Math.exp(-delta / 30);
    this.current.x += (targetX - this.current.x) * blend;
    this.current.y += (targetY - this.current.y) * blend;
    this.current.rotation += (targetRot - this.current.rotation) * blend;
    this.current.scaleX += (targetScaleX - this.current.scaleX) * blend;
    this.current.scaleY += (targetScaleY - this.current.scaleY) * blend;
    this.current.orbScale += (targetOrb - this.current.orbScale) * blend;

    this.rig.setPosition(this.current.x, this.current.y);
    this.rig.setRotation(this.current.rotation);
    this.sprite.setScale(this.baseScale * this.current.scaleX, this.baseScale * this.current.scaleY);
    this.castOrb.setScale(Math.max(0, this.current.orbScale));
    this.castOrb.rotation += delta / 120;

    if (this.charged) {
      this.staffGlow.setVisible(true);
      const pulse = 1 + Math.sin(now / 180) * 0.25;
      this.staffGlow.setScale(pulse);
      this.staffGlow.setAlpha(0.4 + Math.sin(now / 180) * 0.2);
    } else {
      this.staffGlow.setVisible(false);
    }
  }
}
