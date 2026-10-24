import Phaser from "phaser";
import { opponentOf, type GameEvent, type MatchState, type PlayerSlot, type Projectile } from "@spellcaster/shared";
import { palette, playerColor, spellColor } from "../theme";

export interface ArenaFrame {
  state: MatchState | null;
  now: number;
  /** The wizard drawn on the left; online play puts the local player there. */
  leftSlot: PlayerSlot;
}

interface WizardView {
  root: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Container;
  shield: Phaser.GameObjects.Graphics;
  frost: Phaser.GameObjects.Graphics;
  aura: Phaser.GameObjects.Graphics;
  orb: Phaser.GameObjects.Arc;
  transformed: Phaser.GameObjects.Container | null;
}

interface ProjectileView {
  node: Phaser.GameObjects.Container;
  trail: Phaser.GameObjects.Particles.ParticleEmitter;
}

interface PlatformSpec {
  x: number;
  y: number;
  width: number;
  depth: number;
}

interface StageLayout {
  spawnY: number;
  platforms: readonly PlatformSpec[];
}

const STAGE_LAYOUTS: readonly StageLayout[] = [
  {
    spawnY: 0.72,
    platforms: [
      { x: 0.08, y: 0.72, width: 0.84, depth: 22 },
      { x: 0.23, y: 0.49, width: 0.23, depth: 14 },
      { x: 0.54, y: 0.49, width: 0.23, depth: 14 },
      { x: 0.41, y: 0.31, width: 0.18, depth: 11 },
    ],
  },
  {
    spawnY: 0.72,
    platforms: [
      { x: 0.05, y: 0.72, width: 0.9, depth: 22 },
      { x: 0.28, y: 0.46, width: 0.44, depth: 14 },
      { x: 0.22, y: 0.29, width: 0.18, depth: 11 },
    ],
  },
  {
    spawnY: 0.72,
    platforms: [
      { x: 0.1, y: 0.72, width: 0.8, depth: 22 },
      { x: 0.13, y: 0.51, width: 0.26, depth: 14 },
      { x: 0.61, y: 0.45, width: 0.26, depth: 14 },
      { x: 0.39, y: 0.29, width: 0.22, depth: 11 },
    ],
  },
];

const SPARK = "spark";
const isStageId = (stageId: number | undefined): stageId is number =>
  stageId !== undefined && Number.isInteger(stageId) && stageId >= 0 && stageId < STAGE_LAYOUTS.length;

/** Renders match state; it owns no game rules and never decides outcomes. */
export class ArenaScene extends Phaser.Scene {
  private readonly getFrame: () => ArenaFrame;
  private readonly queue: GameEvent[] = [];
  private wizards = {} as Record<PlayerSlot, WizardView>;
  private projectiles = new Map<string, ProjectileView>();
  private lastPositions = new Map<string, { x: number; y: number }>();
  private stageObjects: Phaser.GameObjects.GameObject[] = [];
  private layoutIndex: number | null = null;
  private previousPhase: MatchState["phase"] | null = null;
  private unit = 1;

  constructor(getFrame: () => ArenaFrame) {
    super("arena");
    this.getFrame = getFrame;
  }

  pushEvents(events: GameEvent[]) {
    this.queue.push(...events);
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

  update() {
    const { state, now } = this.getFrame();
    if (!state) return;
    if (this.previousPhase === "finished" && state.phase === "countdown") {
      if (isStageId(state.stageId)) this.layoutIndex = state.stageId;
      else this.chooseNextLayout();
      this.drawStageLayout();
    }
    this.previousPhase = state.phase;
    for (const event of this.queue.splice(0)) this.react(event);
    for (const slot of ["A", "B"] as PlayerSlot[]) this.updateWizard(slot, state, now);
    this.updateProjectiles(state.projectiles, now);
  }

  // ---------- layout ----------

  private anchor(slot: PlayerSlot) {
    const { width, height } = this.scale;
    const left = this.getFrame().leftSlot === slot;
    const spawnY = STAGE_LAYOUTS[this.layoutIndex ?? 0].spawnY;
    return { x: width * (left ? 0.13 : 0.87), y: height * spawnY, facing: left ? 1 : -1 };
  }

  /** Where spells leave the staff and where they strike. */
  private castPoint(slot: PlayerSlot) {
    const { x, y, facing } = this.anchor(slot);
    return { x: x + facing * 58 * this.unit, y: y - 120 * this.unit };
  }

  private build() {
    const { width, height } = this.scale;
    this.unit = Math.max(0.55, Math.min(1.3, height / 520));
    const stageId = this.getFrame().state?.stageId;
    if (isStageId(stageId)) this.layoutIndex = stageId;
    else if (this.layoutIndex === null) this.layoutIndex = Math.floor(Math.random() * STAGE_LAYOUTS.length);
    this.stageObjects = [];
    this.projectiles.clear();
    this.lastPositions.clear();
    this.drawBackdrop(width, height);
    this.wizards = { A: this.makeWizard("A"), B: this.makeWizard("B") };
  }

  private drawBackdrop(width: number, height: number) {
    const sky = this.add.graphics();
    sky.fillGradientStyle(palette.night, palette.night, palette.dusk, palette.plum, 1);
    sky.fillRect(0, 0, width, height);

    for (let i = 0; i < 70; i += 1) {
      const star = this.add.circle(Math.random() * width, Math.random() * height * 0.6, Math.random() * 1.6 + 0.4, palette.goldSoft, 0.8);
      this.tweens.add({ targets: star, alpha: 0.15, duration: 900 + Math.random() * 1800, yoyo: true, repeat: -1, delay: Math.random() * 1500 });
    }

    const moonX = width * 0.5;
    const moonY = height * 0.2;
    this.add.circle(moonX, moonY, 70 * this.unit, palette.goldSoft, 0.08);
    this.add.circle(moonX, moonY, 44 * this.unit, palette.goldSoft, 0.9);
    this.add.circle(moonX + 14 * this.unit, moonY - 8 * this.unit, 40 * this.unit, palette.night2, 0.85);

    // Castle silhouette behind the arena.
    const castle = this.add.graphics();
    const base = height * 0.74;
    const u = this.unit;
    castle.fillStyle(palette.night2, 1);
    castle.fillRect(width * 0.5 - 150 * u, base - 120 * u, 300 * u, 120 * u);
    for (const [dx, w, h] of [[-170, 50, 200], [120, 50, 200], [-40, 80, 250], [-110, 36, 150], [74, 36, 150]] as const) {
      const x = width * 0.5 + dx * u;
      castle.fillRect(x, base - h * u, w * u, h * u);
      castle.fillTriangle(x - 8 * u, base - h * u, x + (w / 2) * u, base - (h + 60) * u, x + (w + 8) * u, base - h * u);
    }
    castle.fillStyle(palette.gold, 0.7);
    for (const [dx, dy] of [[-150, 150], [138, 150], [-6, 190], [-6, 110], [-90, 70], [80, 70]] as const) {
      castle.fillRoundedRect(width * 0.5 + dx * u, base - dy * u, 10 * u, 16 * u, 4 * u);
    }

    const lowerGround = this.add.graphics();
    lowerGround.fillStyle(palette.plum, 0.42);
    lowerGround.fillEllipse(width * 0.5, height * 0.96, width * 1.35, height * 0.22);
    lowerGround.lineStyle(2, palette.gold, 0.12);
    lowerGround.strokeEllipse(width * 0.5, height * 0.94, width * 0.9, height * 0.12);
    this.drawStageLayout();
  }

  private chooseNextLayout() {
    const choices = STAGE_LAYOUTS.map((_, index) => index).filter((index) => index !== this.layoutIndex);
    this.layoutIndex = choices[Math.floor(Math.random() * choices.length)];
  }

  private drawStageLayout() {
    for (const object of this.stageObjects) object.destroy();
    this.stageObjects = [];
    const { width, height } = this.scale;
    const layout = STAGE_LAYOUTS[this.layoutIndex ?? 0];
    for (const [index, spec] of layout.platforms.entries()) {
      this.drawPlatform(
        width * spec.x,
        height * spec.y,
        width * spec.width,
        spec.depth * this.unit,
        index === 0,
      );
    }
  }

  private drawPlatform(x: number, y: number, width: number, depth: number, main: boolean) {
    const u = this.unit;
    const shadow = this.add.ellipse(x + width * 0.5, y + depth + 19 * u, width * 0.92, depth * 2.2, 0x000000, 0.28);
    const platform = this.add.graphics();
    const inset = (main ? 18 : 10) * u;

    platform.fillStyle(palette.night2, 0.98);
    platform.fillPoints([
      new Phaser.Geom.Point(x, y + 8 * u),
      new Phaser.Geom.Point(x + width, y + 8 * u),
      new Phaser.Geom.Point(x + width - inset, y + depth + 8 * u),
      new Phaser.Geom.Point(x + inset, y + depth + 8 * u),
    ], true);
    platform.fillStyle(palette.plum, 1);
    platform.fillPoints([
      new Phaser.Geom.Point(x + inset, y + 10 * u),
      new Phaser.Geom.Point(x + width - inset, y + 10 * u),
      new Phaser.Geom.Point(x + width - inset - 12 * u, y + depth + 7 * u),
      new Phaser.Geom.Point(x + inset + 12 * u, y + depth + 7 * u),
    ], true);

    platform.fillStyle(palette.dusk, 1);
    platform.fillRoundedRect(x, y, width, 10 * u, 5 * u);
    platform.fillStyle(palette.mint, 0.92);
    platform.fillRoundedRect(x + 5 * u, y, Math.max(0, width - 10 * u), 3 * u, 2 * u);
    platform.lineStyle(1.5 * u, palette.gold, main ? 0.42 : 0.24);
    platform.lineBetween(x + inset, y + 11 * u, x + width - inset, y + 11 * u);

    this.stageObjects.push(shadow, platform);
  }

  private makeWizard(slot: PlayerSlot): WizardView {
    const { x, y, facing } = this.anchor(slot);
    const color = playerColor[slot];
    const root = this.add.container(x, y).setScale(this.unit);
    const shadow = this.add.ellipse(0, 4, 120, 22, 0x000000, 0.35);
    const aura = this.add.graphics();
    const body = this.add.container(0, 0);

    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillTriangle(-46, 0, 46, 0, 0, -120); // robe
    g.fillStyle(palette.gold, 1);
    g.fillRect(-40, -12, 80, 7); // hem
    g.fillStyle(palette.parchment, 1);
    g.fillCircle(0, -128, 20); // face
    g.fillStyle(0xf7f1ff, 1);
    g.fillTriangle(-16, -122, 16, -122, 0 + 6 * facing, -82); // beard
    g.fillStyle(palette.night, 1);
    g.fillCircle(7 * facing, -132, 3); // eye
    g.fillStyle(Phaser.Display.Color.ValueToColor(color).darken(25).color, 1);
    g.fillTriangle(-34, -140, 34, -140, -18 * facing, -222); // hat
    g.fillEllipse(0, -140, 84, 14); // brim
    g.fillStyle(palette.gold, 1);
    g.fillCircle(-6 * facing, -175, 5); // hat star
    g.lineStyle(6, 0x8a5a3c, 1);
    g.lineBetween(58 * facing, 0, 58 * facing, -122); // staff
    const orb = this.add.circle(58 * facing, -128, 10, palette.gold, 1);
    const glow = this.add.circle(58 * facing, -128, 20, palette.gold, 0.25);
    this.tweens.add({ targets: glow, scale: 1.4, alpha: 0.05, duration: 900, yoyo: true, repeat: -1 });
    body.add([g, glow, orb]);
    this.tweens.add({ targets: body, y: -6, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

    const shield = this.add.graphics();
    shield.fillStyle(palette.gold, 0.14);
    shield.fillCircle(0, -105, 105);
    shield.lineStyle(4, palette.goldSoft, 0.9);
    shield.strokeCircle(0, -105, 105);
    shield.lineStyle(2, palette.gold, 0.5);
    shield.strokeCircle(0, -105, 90);
    shield.setVisible(false);

    const frost = this.add.graphics();
    frost.fillStyle(palette.frost, 0.35);
    frost.fillRoundedRect(-60, -235, 120, 240, 24);
    frost.lineStyle(3, 0xffffff, 0.8);
    for (const [a, b, c, d] of [[-50, -30, -20, -90], [40, -60, 10, -150], [-30, -200, 20, -170]] as const) frost.lineBetween(a, b, c, d);
    frost.setVisible(false);

    root.add([shadow, aura, body, shield, frost]);
    return { root, body, shield, frost, aura, orb, transformed: null };
  }

  // ---------- per-frame ----------

  private updateWizard(slot: PlayerSlot, state: MatchState, now: number) {
    const view = this.wizards[slot];
    const player = state.players[slot];
    const finishedLoser = state.phase === "finished" && state.winner && state.winner !== slot;

    if (finishedLoser && !view.transformed) return this.transform(slot, state.loserForm);
    if (finishedLoser) return;
    if (view.transformed) {
      view.transformed.destroy();
      view.transformed = null;
      view.body.setVisible(true);
    }

    view.shield.setVisible(now < player.shieldUntil);
    view.shield.setAlpha(0.75 + Math.sin(now / 60) * 0.25);
    view.frost.setVisible(now < player.frozenUntil);

    view.aura.clear();
    const empowered = now < player.empoweredUntil;
    const charged = player.ultimate >= 100;
    if (empowered || charged || now < player.hasteUntil) {
      const pulse = 1 + Math.sin(now / 150) * 0.08;
      view.aura.fillStyle(empowered || charged ? palette.gold : palette.mint, 0.18);
      view.aura.fillEllipse(0, -100, 150 * pulse, 240 * pulse);
    }
    view.orb.setFillStyle(charged ? 0xffffff : palette.gold);
  }

  private updateProjectiles(list: Projectile[], now: number) {
    const live = new Set(list.map((p) => p.id));
    for (const [id, view] of this.projectiles) {
      if (live.has(id)) continue;
      view.trail.stop();
      this.time.delayedCall(400, () => view.trail.destroy());
      view.node.destroy();
      this.projectiles.delete(id);
    }

    for (const projectile of list) {
      let view = this.projectiles.get(projectile.id);
      if (!view) {
        view = this.makeProjectile(projectile);
        this.projectiles.set(projectile.id, view);
      }
      const from = this.castPoint(projectile.owner);
      const to = this.castPoint(opponentOf(projectile.owner));
      const t = Phaser.Math.Clamp((now - projectile.launchedAt) / (projectile.arrivesAt - projectile.launchedAt), 0, 1);
      const x = Phaser.Math.Linear(from.x, to.x, t);
      const y = Phaser.Math.Linear(from.y, to.y, t) - Math.sin(t * Math.PI) * 40 * this.unit;
      view.node.setPosition(x, y).setRotation(now / 90);
      view.trail.setPosition(x, y);
      this.lastPositions.set(projectile.id, { x, y });
    }
  }

  private makeProjectile(projectile: Projectile): ProjectileView {
    const color = spellColor[projectile.spell];
    const size =
      (projectile.spell === "ultimate" ? 26 : projectile.spell === "ice" ? 14 : 18) *
      this.unit *
      (projectile.empowered ? 1.35 : 1);
    const node = this.add.container(0, 0).setDepth(5);
    node.add(this.add.circle(0, 0, size * 1.8, color, 0.2));
    node.add(this.add.circle(0, 0, size, color, 1));
    node.add(this.add.circle(0, 0, size * 0.45, 0xffffff, 0.9));
    if (projectile.spell === "ice") node.add(this.add.star(0, 0, 6, size * 0.6, size * 1.6, palette.frost, 0.9));
    if (projectile.spell === "ultimate") node.add(this.add.star(0, 0, 5, size * 0.8, size * 2, palette.goldSoft, 0.8));
    const trail = this.add.particles(0, 0, SPARK, {
      speed: { min: 10, max: 60 },
      lifespan: 380,
      scale: { start: size / 10, end: 0 },
      tint: color,
      blendMode: "ADD",
      frequency: 16,
    });
    trail.setDepth(4);
    return { node, trail };
  }

  // ---------- events ----------

  private react(event: GameEvent) {
    switch (event.type) {
      case "SPELL_CAST": {
        const point = this.castPoint(event.slot);
        this.burst(point.x, point.y, spellColor[event.spell], 10, 0.8);
        break;
      }
      case "DAMAGE_APPLIED":
        this.onHit(event.target, event.amount, spellColor[event.spell]);
        break;
      case "SPELL_BLOCKED": {
        const point = this.castPoint(event.defender);
        this.burst(point.x, point.y, palette.gold, 28, 1.4);
        this.floatText(point.x, point.y - 40 * this.unit, "BLOCKED!", "#ffe7a8");
        break;
      }
      case "FROZEN": {
        const { x, y } = this.anchor(event.slot);
        this.burst(x, y - 100 * this.unit, palette.frost, 24, 1.2);
        break;
      }
      case "SPELL_CLASH": {
        const point = event.fizzledIds.map((id) => this.lastPositions.get(id)).find(Boolean) ?? { x: this.scale.width / 2, y: this.scale.height * 0.55 };
        this.burst(point.x, point.y, palette.goldSoft, 50, 2.2);
        this.burst(point.x, point.y, palette.rose, 25, 1.6);
        this.cameras.main.shake(260, 0.012);
        this.cameras.main.flash(160, 255, 231, 168);
        break;
      }
      default:
        break;
    }
  }

  private onHit(target: PlayerSlot, amount: number, color: number) {
    const view = this.wizards[target];
    const { x, y, facing } = this.anchor(target);
    this.burst(x, y - 110 * this.unit, color, 20 + amount, 1.3);
    this.floatText(x, y - 240 * this.unit, `-${amount}`, "#ff4f7b");
    this.cameras.main.shake(120 + amount * 6, 0.004 + amount * 0.0003);
    this.tweens.add({ targets: view.body, alpha: 0.25, duration: 70, yoyo: true, repeat: 2 });
    this.tweens.add({ targets: view.root, x: x - facing * 16 * this.unit, duration: 90, yoyo: true, ease: "Quad.easeOut" });
  }

  private transform(slot: PlayerSlot, form: MatchState["loserForm"]) {
    const view = this.wizards[slot];
    const { x, y } = this.anchor(slot);
    this.burst(x, y - 90 * this.unit, palette.mint, 60, 2);
    this.burst(x, y - 90 * this.unit, palette.goldSoft, 40, 1.6);
    view.body.setVisible(false);
    view.shield.setVisible(false);
    view.frost.setVisible(false);

    const g = this.add.graphics();
    if (form === "frog") {
      g.fillStyle(palette.leaf, 1);
      g.fillEllipse(0, -30, 110, 60);
      g.fillEllipse(-30, -62, 34, 30);
      g.fillEllipse(30, -62, 34, 30);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(-30, -66, 11);
      g.fillCircle(30, -66, 11);
      g.fillStyle(palette.night, 1);
      g.fillCircle(-28, -66, 5);
      g.fillCircle(32, -66, 5);
      g.lineStyle(3, palette.night, 1);
      g.beginPath();
      g.arc(0, -36, 22, 0.2, Math.PI - 0.2);
      g.strokePath();
      g.fillStyle(palette.gold, 1); // a tiny crown: this frog was a wizard once
      g.fillTriangle(-16, -78, -8, -98, 0, -78);
      g.fillTriangle(-4, -78, 4, -102, 12, -78);
      g.fillTriangle(8, -78, 16, -98, 24, -78);
    } else {
      g.fillStyle(palette.parchment, 1);
      g.fillEllipse(0, -45, 110, 80);
      g.fillTriangle(50, -50, 95, -85, 52, -28);
      g.lineStyle(9, palette.parchment, 1);
      g.strokeCircle(-62, -48, 22);
      g.fillStyle(palette.rose, 1);
      g.fillEllipse(0, -84, 60, 14);
      g.fillCircle(0, -94, 8);
      g.fillStyle(palette.rose, 0.8);
      g.fillCircle(-20, -48, 7);
      g.fillCircle(10, -36, 7);
      g.fillCircle(25, -58, 6);
    }
    const node = this.add.container(0, 0, [g]).setScale(0.2);
    view.root.add(node);
    view.transformed = node;
    this.tweens.add({ targets: node, scale: 1, duration: 450, ease: "Back.easeOut" });
    this.tweens.add({ targets: node, y: -18, duration: 380, yoyo: true, repeat: -1, ease: "Sine.easeInOut", delay: 500 });
    this.cameras.main.shake(300, 0.01);
  }

  // ---------- helpers ----------

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
    emitter.explode(count);
    this.time.delayedCall(900, () => emitter.destroy());
  }

  private floatText(x: number, y: number, text: string, color: string) {
    const label = this.add
      .text(x, y, text, { fontFamily: "Cinzel Decorative, serif", fontSize: `${Math.round(30 * this.unit)}px`, color, stroke: "#120d2b", strokeThickness: 6 })
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
