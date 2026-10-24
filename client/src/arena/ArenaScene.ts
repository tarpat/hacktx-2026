import Phaser from "phaser";
import { opponentOf, type GameEvent, type MatchState, type PlayerSlot, type Projectile, type SpellId } from "@spellcaster/shared";
import { arenaTextures, art, palette, spellColor, textureUrl, wizardStyle } from "../theme";
import { MAP_ORDER, MAPS, type MapId } from "./maps";
import { RELEASE_MS, WizardRig } from "./WizardRig";

const fxUrl = (name: string) => `${import.meta.env.BASE_URL}assets/fx/${name}.png`;

export interface ArenaFrame {
  state: MatchState | null;
  now: number;
  /** The wizard drawn on the left; online play puts the local player there. */
  leftSlot: PlayerSlot;
  map: MapId;
  /** Screen space covered by the floating HUD (top) and spell cards (bottom), in pixels. */
  insets: { top: number; bottom: number };
}

interface WizardView {
  root: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Container;
  rig: WizardRig;
  shield: Phaser.GameObjects.Image;
  frost: Phaser.GameObjects.Image;
  aura: Phaser.GameObjects.Image;
  empower: Phaser.GameObjects.Image;
  haste: Phaser.GameObjects.Image;
  transformed: Phaser.GameObjects.Container | null;
}

interface ProjectileView {
  node: Phaser.GameObjects.Sprite;
  trail: Phaser.GameObjects.Particles.ParticleEmitter;
}

interface Release {
  /** Match-clock time the hand let go. */
  at: number;
  from: { x: number; y: number };
}

/** Extra wait before showing a spell whose release animation never fired (e.g. caster was hit). */
const RELEASE_FALLBACK_MS = 200;

const SPARK = "spark";
const BACKGROUND = "background";
/** Background art is 1024x572; the white brick path sits at this height in it. */
const BG_SIZE = { width: 1024, height: 572 };
const BG_PATH_Y = 512;

type Bolt = Exclude<SpellId, "shield">;

/**
 * Animated effect sheets in assets/fx. Bolts play a launch, then loop their flight frames;
 * the rest are one-shot impacts. Sources and licenses: assets/fx/CREDITS.txt.
 */
const FX_SHEETS = {
  "fx-fireball": { file: "fireball", frameWidth: 192, frameHeight: 144 },
  "fx-frostbolt": { file: "frostbolt", frameWidth: 192, frameHeight: 144 },
  "fx-freeze": { file: "freeze", frameWidth: 160, frameHeight: 160 },
  "fx-explosion": { file: "explosion", frameWidth: 224, frameHeight: 224 },
  "fx-sparkle": { file: "sparkle", frameWidth: 224, frameHeight: 224 },
} as const;

const FX_ANIMS: { key: string; sheet: keyof typeof FX_SHEETS; start: number; end: number; frameRate: number; repeat?: number }[] = [
  { key: "fireball-launch", sheet: "fx-fireball", start: 4, end: 11, frameRate: 30 },
  { key: "fireball-fly", sheet: "fx-fireball", start: 12, end: 27, frameRate: 24, repeat: -1 },
  { key: "frostbolt-launch", sheet: "fx-frostbolt", start: 4, end: 11, frameRate: 30 },
  { key: "frostbolt-fly", sheet: "fx-frostbolt", start: 12, end: 27, frameRate: 24, repeat: -1 },
  { key: "freeze", sheet: "fx-freeze", start: 0, end: 31, frameRate: 40 },
  { key: "explosion", sheet: "fx-explosion", start: 0, end: 25, frameRate: 36 },
  { key: "sparkle", sheet: "fx-sparkle", start: 0, end: 10, frameRate: 22 },
];

/** Soft particle textures (Kenney, CC0) tinted per spell for trails and bursts. */
const FX_PARTICLES = ["flame-4", "magic-3", "star-6"] as const;

/**
 * How each bolt flies: an animated sheet (fireball, ice) or the illustrated still (ultimate),
 * where the orb sits in the frame, its size, and the particle texture streaming behind it.
 */
const PROJECTILE_ART: Record<Bolt, { key: string; launch?: string; fly?: string; originX: number; size: number; trail: string; glow: number }> = {
  fireball: { key: "fx-fireball", launch: "fireball-launch", fly: "fireball-fly", originX: 0.63, size: 190, trail: "flame-4", glow: 0xff6a1f },
  ice: { key: "fx-frostbolt", launch: "frostbolt-launch", fly: "frostbolt-fly", originX: 0.63, size: 180, trail: "magic-3", glow: 0x6fb8ff },
  ultimate: { key: "fulmen", originX: 0.68, size: 240, trail: "star-6", glow: 0xfff27a },
};

/** Animated impacts layered on hit; the ultimate also keeps its illustrated flash. */
const IMPACT_FX: Record<Bolt, { anim: string; size: number; still?: { key: string; size: number } }[]> = {
  fireball: [{ anim: "explosion", size: 300 }],
  ice: [{ anim: "freeze", size: 300 }],
  ultimate: [{ anim: "explosion", size: 420, still: { key: "fulmen-impact", size: 340 } }, { anim: "sparkle", size: 380 }],
};

/** The server's synced stage wins online; practice uses the locally picked map. */
const mapFor = (frame: ArenaFrame): MapId => {
  const stageId = frame.state?.stageId;
  return stageId !== undefined && MAP_ORDER[stageId] ? MAP_ORDER[stageId] : frame.map;
};

/** Renders match state; it owns no game rules and never decides outcomes. */
export class ArenaScene extends Phaser.Scene {
  private readonly getFrame: () => ArenaFrame;
  private readonly queue: GameEvent[] = [];
  private wizards = {} as Record<PlayerSlot, WizardView>;
  private projectiles = new Map<string, ProjectileView>();
  private lastPositions = new Map<string, { x: number; y: number }>();
  private releases = new Map<string, Release>();
  private unit = 1;
  private groundY = 0;
  private builtMap: MapId | null = null;
  private builtSize = "";

  constructor(getFrame: () => ArenaFrame) {
    super("arena");
    this.getFrame = getFrame;
  }

  pushEvents(events: GameEvent[]) {
    this.queue.push(...events);
  }

  preload() {
    if (!this.textures.exists(BACKGROUND)) this.load.image(BACKGROUND, art.background);
    for (const key of arenaTextures) if (!this.textures.exists(key)) this.load.image(key, textureUrl(key));
    for (const [key, { file, ...frame }] of Object.entries(FX_SHEETS)) {
      if (!this.textures.exists(key)) this.load.spritesheet(key, fxUrl(file), frame);
    }
    for (const key of FX_PARTICLES) if (!this.textures.exists(key)) this.load.image(key, fxUrl(key));
  }

  create() {
    this.makeTextures();
    for (const { key, sheet, start, end, frameRate, repeat } of FX_ANIMS) {
      if (!this.anims.exists(key)) this.anims.create({ key, frames: this.anims.generateFrameNumbers(sheet, { start, end }), frameRate, repeat });
    }
    this.build();
  }

  update(time: number, delta: number) {
    const frame = this.getFrame();
    const { state, now } = frame;
    // Rebuild when the synced map arrives or the stage was resized since the last build.
    if (mapFor(frame) !== this.builtMap || this.sizeKey() !== this.builtSize) return this.scene.restart();
    if (!state) return;
    for (const event of this.queue.splice(0)) this.react(event, time);
    for (const slot of ["A", "B"] as PlayerSlot[]) this.updateWizard(slot, state, now, time, delta);
    this.updateProjectiles(state.projectiles, now);
  }

  // ---------- layout ----------

  private sizeKey() {
    const { top, bottom } = this.getFrame().insets;
    return `${Math.round(this.scale.width)}x${Math.round(this.scale.height)}:${Math.round(top)}:${Math.round(bottom)}`;
  }

  private anchor(slot: PlayerSlot) {
    const { width } = this.scale;
    const left = this.getFrame().leftSlot === slot;
    return { x: width * (left ? 0.13 : 0.87), y: this.groundY, facing: left ? 1 : -1 };
  }

  /** Where spells strike a wizard (chest height, just in front of them). */
  private castPoint(slot: PlayerSlot) {
    const { x, y, facing } = this.anchor(slot);
    return { x: x + facing * 30 * this.unit, y: y - 110 * this.unit };
  }

  private build() {
    const { width, height } = this.scale;
    const { top, bottom } = this.getFrame().insets;
    // Size wizards to the open band between the floating HUD and the spell cards.
    this.unit = Math.max(0.5, Math.min(1.3, (height - top - bottom) / 430));
    this.projectiles.clear();
    this.lastPositions.clear();
    this.releases.clear();
    this.builtMap = mapFor(this.getFrame());
    this.builtSize = this.sizeKey();
    this.drawBackdrop(width, height);
    this.wizards = { A: this.makeWizard("A"), B: this.makeWizard("B") };
  }

  private drawBackdrop(width: number, height: number) {
    const insets = this.getFrame().insets;
    // The brick path sits just above the spell cards so the wizards are never covered.
    this.groundY = height - insets.bottom - 14 * this.unit;
    // Cover the screen with the forest-and-tower painting, scaled so its path lands on groundY
    // and the top edge never shows.
    const scale = Math.max(width / BG_SIZE.width, this.groundY / BG_PATH_Y);
    const top = this.groundY - BG_PATH_Y * scale;
    this.add.image(width / 2, top, BACKGROUND).setOrigin(0.5, 0).setScale(scale);

    // Below the painting, extend the forest floor behind the spell cards.
    const paintingBottom = top + BG_SIZE.height * scale;
    for (let y = paintingBottom - 30 * scale; y < height; ) {
      const floor = this.add.image(width / 2, y, "ground").setOrigin(0.5, 0);
      floor.setScale((width * 1.06) / floor.width);
      y += floor.displayHeight * 0.55;
    }

    // Lanterns drifting up into the sunset.
    this.add.particles(0, 0, SPARK, {
      x: { min: 0, max: width },
      y: this.groundY,
      speedY: { min: -18, max: -38 },
      speedX: { min: -6, max: 6 },
      lifespan: 14_000,
      frequency: 650,
      scale: { min: 0.25 * this.unit, max: 0.6 * this.unit },
      alpha: { start: 0.9, end: 0 },
      tint: [palette.gold, palette.goldSoft, 0xffb37a],
      blendMode: "ADD",
      advance: 10_000,
    });

    // Ledge heights are fractions of the open band above the path, so they clear the HUD.
    const band = this.groundY - insets.top;
    for (const ledge of MAPS[this.builtMap ?? "twin-ledges"].ledges) {
      const y = insets.top + (ledge.y / 0.85) * band;
      const branch = this.add.image(width * ledge.x, y, "platform-upper");
      branch.setScale((width * ledge.width) / branch.width);
      this.tweens.add({ targets: branch, y: branch.y - 5 * this.unit, duration: 2600 + ledge.x * 1200, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    }
  }

  private makeWizard(slot: PlayerSlot): WizardView {
    const { x, y, facing } = this.anchor(slot);
    // The rig is drawn facing right; mirroring the root turns the right-hand wizard around.
    const root = this.add.container(x, y).setScale(this.unit * facing, this.unit).setDepth(3);
    const shadow = this.add.ellipse(0, 4, 120, 22, 0x000000, 0.3);
    const aura = this.sized("ultimate-aura", 0, -112, 270).setVisible(false);
    const haste = this.sized("haste", 0, -2, 150).setScale(0, 0).setVisible(false);
    const rig = new WizardRig(this, wizardStyle[slot]);
    const body = rig.container;
    const shield = this.sized("shield", 4, -108, 250).setVisible(false);
    const frost = this.sized("frozen", 2, -112, 260).setVisible(false);
    const empower = this.sized("empower", 0, -268, 64).setVisible(false);
    root.add([shadow, aura, haste, body, shield, frost, empower]);
    return { root, body, rig, shield, frost, aura, empower, haste, transformed: null };
  }

  /** An image whose larger side is `size` units. */
  private sized(key: string, x: number, y: number, size: number) {
    const image = this.add.image(x, y, key);
    image.setScale(size / Math.max(image.width, image.height));
    image.setData("base", image.scaleX);
    return image;
  }

  // ---------- per-frame ----------

  private updateWizard(slot: PlayerSlot, state: MatchState, now: number, time: number, delta: number) {
    const view = this.wizards[slot];
    const player = state.players[slot];
    view.rig.setCheering(state.phase === "finished" && state.winner === slot);
    view.rig.update(time, delta, now < player.frozenUntil);
    const finishedLoser = state.phase === "finished" && state.winner && state.winner !== slot;

    if (finishedLoser && !view.transformed) return this.transform(slot, state.loserForm);
    if (finishedLoser) return;
    if (view.transformed) {
      view.transformed.destroy();
      view.transformed = null;
      view.body.setVisible(true);
    }

    const base = (image: Phaser.GameObjects.Image) => image.getData("base") as number;
    const shielded = now < player.shieldUntil;
    view.shield.setVisible(shielded);
    if (shielded) {
      view.shield.setRotation(now / 900).setScale(base(view.shield) * (1 + Math.sin(now / 90) * 0.03));
      view.shield.setAlpha(0.85 + Math.sin(now / 60) * 0.15);
    }
    view.frost.setVisible(now < player.frozenUntil);

    const charged = player.ultimate >= 100;
    view.aura.setVisible(charged);
    if (charged) view.aura.setScale(base(view.aura) * (1 + Math.sin(now / 160) * 0.05)).setAlpha(0.75 + Math.sin(now / 160) * 0.2);

    const empowered = now < player.empoweredUntil;
    view.empower.setVisible(empowered);
    if (empowered) view.empower.setY(-268 + Math.sin(now / 300) * 6).setRotation(Math.sin(now / 500) * 0.15);

    const hasted = now < player.hasteUntil;
    view.haste.setVisible(hasted);
    if (hasted) view.haste.setScale(base(view.haste), base(view.haste) * 0.35).setRotation(-now / 160);

    view.rig.setCharged(charged);
  }

  private updateProjectiles(list: Projectile[], now: number) {
    const live = new Set(list.map((p) => p.id));
    for (const [id, view] of this.projectiles) {
      if (live.has(id)) continue;
      view.trail.stop();
      this.time.delayedCall(400, () => view.trail.destroy());
      view.node.destroy();
      this.projectiles.delete(id);
      this.releases.delete(id);
    }

    for (const projectile of list) {
      let view = this.projectiles.get(projectile.id);
      if (!view) {
        view = this.makeProjectile(projectile);
        this.projectiles.set(projectile.id, view);
      }
      // Hide the spell while the caster winds up and fly it from the hand once the throw
      // animation lets go. The hit still lands at arrivesAt, so the visible flight is quicker.
      let release = this.releases.get(projectile.id);
      const fallbackAt = projectile.launchedAt + RELEASE_MS[projectile.spell as keyof typeof RELEASE_MS] + RELEASE_FALLBACK_MS;
      if (!release && now >= fallbackAt) {
        release = { at: now, from: this.wizards[projectile.owner].rig.handPoint() };
        this.releases.set(projectile.id, release);
      }
      if (release && !view.node.visible) this.launch(view, projectile.spell as Bolt);
      view.node.setVisible(Boolean(release));
      view.trail.emitting = Boolean(release);
      if (!release) continue;
      const { from, at: releaseAt } = release;
      const to = this.castPoint(opponentOf(projectile.owner));
      const t = Phaser.Math.Clamp((now - releaseAt) / Math.max(1, projectile.arrivesAt - releaseAt), 0, 1);
      const x = Phaser.Math.Linear(from.x, to.x, t);
      const arc = Math.sin(t * Math.PI) * 40 * this.unit;
      const y = Phaser.Math.Linear(from.y, to.y, t) - arc;
      // Tilt along the arc so the trail streams out behind the orb.
      const slope = -Math.cos(t * Math.PI) * 0.25;
      view.node.setPosition(x, y).setRotation(view.node.flipX ? -slope : slope);
      // The trail spawns at the orb, not the sprite's tail.
      view.trail.setPosition(x, y);
      this.lastPositions.set(projectile.id, { x, y });
    }
  }

  private makeProjectile(projectile: Projectile): ProjectileView {
    const color = spellColor[projectile.spell];
    const look = PROJECTILE_ART[projectile.spell as Bolt];
    const towardRight = this.anchor(projectile.owner).facing === 1;
    const node = this.add.sprite(0, 0, look.key).setDepth(6).setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
    const size = look.size * this.unit * (projectile.empowered ? 1.3 : 1);
    node.setScale(size / node.width);
    node.setData("base", node.scaleX);
    node.setFlipX(!towardRight);
    node.setOrigin(towardRight ? look.originX : 1 - look.originX, 0.5);
    // WebGL only: a soft glow so bolts read as light, not stickers.
    node.preFX?.addGlow(look.glow, 3, 0, false, 0.1, 12);
    const trail = this.add.particles(0, 0, look.trail, {
      speed: { min: 8, max: 40 },
      lifespan: { min: 280, max: 520 },
      scale: { start: 0.45 * this.unit * (projectile.empowered ? 1.3 : 1), end: 0 },
      alpha: { start: 0.9, end: 0 },
      rotate: { min: 0, max: 360 },
      tint: [color, look.glow, palette.goldSoft],
      blendMode: "ADD",
      frequency: 14,
    });
    trail.setDepth(5);
    return { node, trail };
  }

  /** The moment a bolt leaves the hand: a launch animation into its looping flight, or a pop-in for stills. */
  private launch(view: ProjectileView, spell: Bolt) {
    const look = PROJECTILE_ART[spell];
    const base = view.node.getData("base") as number;
    if (look.launch && look.fly) {
      view.node.play(look.launch).chain(look.fly);
      return;
    }
    // Stretch along the throw, then settle, so the still feels flung rather than placed.
    view.node.setScale(base * 1.35, base * 0.7);
    this.tweens.add({ targets: view.node, scaleX: base, scaleY: base, duration: 220, ease: "Back.easeOut" });
    this.tweens.add({ targets: view.node, alpha: { from: 0.75, to: 1 }, duration: 90, yoyo: true, repeat: -1 });
  }

  // ---------- events ----------

  private react(event: GameEvent, time: number) {
    switch (event.type) {
      case "SPELL_CAST": {
        const rig = this.wizards[event.slot].rig;
        const color = spellColor[event.spell];
        if (event.spell === "shield") {
          rig.play("shield", time);
          break;
        }
        rig.play(event.spell === "ultimate" ? "ultimate" : "throw", time, {
          color,
          releaseMs: RELEASE_MS[event.spell],
          onRelease: () => {
            const hand = rig.handPoint();
            if (event.projectileId) this.releases.set(event.projectileId, { at: this.getFrame().now, from: hand });
            this.burst(hand.x, hand.y, color, 14, 0.9);
          },
        });
        break;
      }
      case "DAMAGE_APPLIED":
        this.onHit(event.target, event.amount, event.spell);
        break;
      case "SPELL_BLOCKED": {
        const point = this.castPoint(event.defender);
        this.flash("shield-shatter", point.x, point.y, 280, 520);
        this.burst(point.x, point.y, palette.gold, 18, 1.2);
        this.floatText(point.x, point.y - 60 * this.unit, "BLOCKED!", "#ffe7a8");
        break;
      }
      case "FROZEN": {
        const { x, y } = this.anchor(event.slot);
        this.burst(x, y - 110 * this.unit, palette.frost, 24, 1.2);
        break;
      }
      case "SPELL_CLASH": {
        const point = event.fizzledIds.map((id) => this.lastPositions.get(id)).find(Boolean) ?? { x: this.scale.width / 2, y: this.scale.height * 0.55 };
        this.flash("clash", point.x, point.y, 360, 700, true);
        this.burst(point.x, point.y, palette.goldSoft, 30, 2);
        this.cameras.main.shake(260, 0.012);
        this.cameras.main.flash(160, 255, 231, 168);
        break;
      }
      default:
        break;
    }
  }

  private onHit(target: PlayerSlot, amount: number, spell: SpellId) {
    const view = this.wizards[target];
    const { x, y, facing } = this.anchor(target);
    const hitX = x + facing * 10 * this.unit;
    const hitY = y - 112 * this.unit;
    for (const fx of IMPACT_FX[spell as Bolt] ?? []) {
      this.playFx(fx.anim, hitX, hitY, fx.size);
      if (fx.still) this.flash(fx.still.key, hitX, hitY, fx.still.size, 560, true);
    }
    if (spell === "ultimate") this.cameras.main.flash(180, 255, 242, 122);
    this.burst(x, y - 110 * this.unit, spellColor[spell], 10 + amount / 2, 1.2);
    this.floatText(x, y - 250 * this.unit, `-${amount}`, "#ff4f7b");
    this.cameras.main.shake(120 + amount * 6, 0.004 + amount * 0.0003);
    view.rig.play("hit", this.time.now);
    this.tweens.add({ targets: view.body, alpha: 0.35, duration: 70, yoyo: true, repeat: 2 });
    this.tweens.add({ targets: view.root, x: x - facing * 16 * this.unit, duration: 90, yoyo: true, ease: "Quad.easeOut" });
  }

  private transform(slot: PlayerSlot, form: MatchState["loserForm"]) {
    const view = this.wizards[slot];
    const { x, y } = this.anchor(slot);
    this.flash("clash", x, y - 100 * this.unit, 300, 800, true);
    this.burst(x, y - 90 * this.unit, palette.lavender, 40, 1.8);
    view.body.setVisible(false);
    for (const layer of [view.shield, view.frost, view.aura, view.empower, view.haste]) layer.setVisible(false);

    const critter = this.sized(form, 0, 0, form === "frog" ? 190 : 200).setOrigin(0.5, 0.92);
    const node = this.add.container(0, 0, [critter]).setScale(0.2);
    view.root.add(node);
    view.transformed = node;
    this.tweens.add({ targets: node, scale: 1, duration: 450, ease: "Back.easeOut" });
    this.tweens.add({ targets: node, y: -16, duration: 380, yoyo: true, repeat: -1, ease: "Sine.easeInOut", delay: 500 });
    this.cameras.main.shake(300, 0.01);
  }

  // ---------- helpers ----------

  /** A one-shot animated effect, removed when its animation ends. */
  private playFx(anim: string, x: number, y: number, size: number) {
    const sprite = this.add.sprite(x, y, FX_ANIMS.find((a) => a.key === anim)!.sheet).setDepth(8).setBlendMode(Phaser.BlendModes.ADD);
    sprite.setScale((size * this.unit) / Math.max(sprite.width, sprite.height)).setRotation(Math.random() * 0.4 - 0.2);
    sprite.play(anim).once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sprite.destroy());
  }

  /** A one-shot illustrated effect that pops in, swells and fades. */
  private flash(key: string, x: number, y: number, size: number, duration: number, additive = false) {
    const image = this.add.image(x, y, key).setDepth(8);
    const scale = (size * this.unit) / Math.max(image.width, image.height);
    image.setScale(scale * 0.55).setAlpha(1).setRotation(Math.random() * 0.6 - 0.3);
    if (additive) image.setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: image, scale: scale * 1.1, alpha: 0, duration, ease: "Cubic.easeOut", onComplete: () => image.destroy() });
  }

  private burst(x: number, y: number, color: number, count: number, power: number) {
    const emitter = this.add.particles(x, y, SPARK, {
      speed: { min: 60 * power, max: 220 * power },
      lifespan: { min: 300, max: 700 },
      scale: { start: 0.9 * this.unit, end: 0 },
      tint: [color, 0xffffff],
      blendMode: "ADD",
      emitting: false,
    });
    emitter.setDepth(8);
    emitter.explode(Math.round(count));
    this.time.delayedCall(900, () => emitter.destroy());
  }

  private floatText(x: number, y: number, text: string, color: string) {
    const label = this.add
      .text(x, y, text, { fontFamily: "Cinzel Decorative, serif", fontSize: `${Math.round(30 * this.unit)}px`, color, stroke: "#1c1236", strokeThickness: 6 })
      .setOrigin(0.5)
      .setDepth(10);
    this.tweens.add({ targets: label, y: y - 60 * this.unit, alpha: 0, duration: 900, ease: "Quad.easeOut", onComplete: () => label.destroy() });
  }

  private makeTextures() {
    if (this.textures.exists(SPARK)) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 8);
    g.generateTexture(SPARK, 16, 16);
    g.destroy();
  }
}
