import Phaser from "phaser";
import { opponentOf, type GameEvent, type MatchState, type PlayerSlot, type Projectile, type SpellId } from "@spellcaster/shared";
import { arenaTextures, art, palette, spellColor, textureUrl, wizardStyle } from "../theme";
import { MAPS, type MapId } from "./maps";
import { RELEASE_MS, WizardRig } from "./WizardRig";

export interface ArenaFrame {
  state: MatchState | null;
  now: number;
  /** The wizard drawn on the left; online play puts the local player there. */
  leftSlot: PlayerSlot;
  map: MapId;
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
  node: Phaser.GameObjects.Image;
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

/** Projectile art: texture, where the orb sits in the image (it has a trail behind it), and size. */
const PROJECTILE_ART: Record<Exclude<SpellId, "shield">, { key: string; originX: number; size: number }> = {
  fireball: { key: "fireball", originX: 0.66, size: 150 },
  ice: { key: "ice", originX: 0.67, size: 130 },
  ultimate: { key: "fulmen", originX: 0.68, size: 230 },
};

const IMPACT_ART: Record<Exclude<SpellId, "shield">, { key: string; size: number }> = {
  fireball: { key: "fireball-impact", size: 230 },
  ice: { key: "hit-sparks", size: 210 },
  ultimate: { key: "fulmen-impact", size: 340 },
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
  }

  create() {
    this.makeTextures();
    this.build();
    // Rebuild the layout after the window settles on a new size.
    let pending: Phaser.Time.TimerEvent | null = null;
    const onResize = () => {
      pending?.remove();
      pending = this.time.delayedCall(150, () => this.scene.restart());
    };
    this.scale.on("resize", onResize);
    this.events.once("shutdown", () => this.scale.off("resize", onResize));
  }

  update(time: number, delta: number) {
    const { state, now, map } = this.getFrame();
    if (map !== this.builtMap) return this.scene.restart();
    if (!state) return;
    for (const event of this.queue.splice(0)) this.react(event, time);
    for (const slot of ["A", "B"] as PlayerSlot[]) this.updateWizard(slot, state, now, time, delta);
    this.updateProjectiles(state.projectiles, now);
  }

  // ---------- layout ----------

  private anchor(slot: PlayerSlot) {
    const { width } = this.scale;
    const left = this.getFrame().leftSlot === slot;
    return { x: width * (left ? 0.2 : 0.8), y: this.groundY, facing: left ? 1 : -1 };
  }

  /** Where spells strike a wizard (chest height, just in front of them). */
  private castPoint(slot: PlayerSlot) {
    const { x, y, facing } = this.anchor(slot);
    return { x: x + facing * 30 * this.unit, y: y - 110 * this.unit };
  }

  private build() {
    const { width, height } = this.scale;
    this.unit = Math.max(0.55, Math.min(1.3, height / 520));
    this.projectiles.clear();
    this.lastPositions.clear();
    this.releases.clear();
    this.builtMap = this.getFrame().map;
    this.drawBackdrop(width, height);
    this.wizards = { A: this.makeWizard("A"), B: this.makeWizard("B") };
    this.drawForeground(width, height);
  }

  private drawBackdrop(width: number, height: number) {
    // Cover the stage with the forest-and-tower painting, anchored so its brick path stays in view.
    const scale = Math.max(width / BG_SIZE.width, height / BG_SIZE.height);
    const top = height - BG_SIZE.height * scale;
    this.add.image(width / 2, top, BACKGROUND).setOrigin(0.5, 0).setScale(scale);
    this.groundY = top + BG_PATH_Y * scale;

    // Lanterns drifting up into the sunset.
    this.add.particles(0, 0, SPARK, {
      x: { min: 0, max: width },
      y: height * 0.75,
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

    for (const ledge of MAPS[this.getFrame().map].ledges) {
      const branch = this.add.image(width * ledge.x, height * ledge.y, "platform-upper");
      branch.setScale((width * ledge.width) / branch.width);
      this.tweens.add({ targets: branch, y: branch.y - 5 * this.unit, duration: 2600 + ledge.x * 1200, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    }
  }

  private drawForeground(width: number, height: number) {
    // Grass, flowers and a fallen log in front of the path frame the duel.
    const ground = this.add.image(width / 2, this.groundY + 26 * this.unit, "ground").setOrigin(0.5, 0).setDepth(9);
    ground.setScale((width * 1.04) / ground.width);
    if (ground.y + 40 > height) ground.setY(height - 40 * this.unit);
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
      if (projectile.spell === "ice") view.node.setRotation(now / 120);
      view.trail.setPosition(x, y);
      this.lastPositions.set(projectile.id, { x, y });
    }
  }

  private makeProjectile(projectile: Projectile): ProjectileView {
    const color = spellColor[projectile.spell];
    const look = PROJECTILE_ART[projectile.spell as keyof typeof PROJECTILE_ART];
    const towardRight = this.anchor(projectile.owner).facing === 1;
    const node = this.add.image(0, 0, look.key).setDepth(6);
    const size = look.size * this.unit * (projectile.empowered ? 1.3 : 1);
    node.setScale(size / node.width);
    node.setFlipX(!towardRight);
    node.setOrigin(towardRight ? look.originX : 1 - look.originX, 0.5);
    const trail = this.add.particles(0, 0, SPARK, {
      speed: { min: 10, max: 50 },
      lifespan: 420,
      scale: { start: 0.7 * this.unit, end: 0 },
      tint: [color, palette.goldSoft],
      blendMode: "ADD",
      frequency: 22,
    });
    trail.setDepth(5);
    return { node, trail };
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
    const impact = IMPACT_ART[spell as keyof typeof IMPACT_ART];
    if (impact) this.flash(impact.key, x + facing * 10 * this.unit, y - 112 * this.unit, impact.size, 560, true);
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
