import Phaser from "phaser";
import { opponentOf, type GameEvent, type MatchState, type PlayerSlot, type Projectile, type SpellId } from "@spellcaster/shared";
import { arenaTextures, art, palette, spellColor, textureUrl } from "../theme";
import { MAP_ORDER, MAPS, type MapId } from "./maps";
import { StruggleBeams } from "./StruggleBeams";
import { RELEASE_MS, WizardRig } from "./WizardRig";
import { getFlair } from "../game/flair";

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
  /** The death animation has started for this match. */
  fallen: boolean;
}

interface ProjectileView {
  node: Phaser.GameObjects.Sprite;
  trail: Phaser.GameObjects.Particles.ParticleEmitter;
}

/** Taurus charging along the path: a tinted run cycle, an additive glow copy, drawn horns and a dust wake. */
interface BullView {
  body: Phaser.GameObjects.Sprite;
  glow: Phaser.GameObjects.Sprite;
  horns: Phaser.GameObjects.Image;
  dust: Phaser.GameObjects.Particles.ParticleEmitter;
  embers: Phaser.GameObjects.Particles.ParticleEmitter;
  /** +1 running right, -1 running left. */
  dir: number;
  lastX: number;
}

/** Fulmen gathering over its target until it strikes. */
interface StormView {
  target: PlayerSlot;
  cloud: Phaser.GameObjects.Particles.ParticleEmitter;
  sparks: Phaser.GameObjects.Particles.ParticleEmitter;
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
/** Bolts thrown across the arena; Fulmen falls from the sky instead. */
type Thrown = Exclude<Bolt, "ultimate" | "taurus">;

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
  "fx-lightning-strike": { file: "lightning-strike", frameWidth: 256, frameHeight: 256 },
  "fx-lightning-burst": { file: "lightning-burst", frameWidth: 256, frameHeight: 256 },
  "fx-bull": { file: "bull-run", frameWidth: 222, frameHeight: 162 },
} as const;

const FX_ANIMS: { key: string; sheet: keyof typeof FX_SHEETS; start: number; end: number; frameRate: number; repeat?: number }[] = [
  { key: "fireball-launch", sheet: "fx-fireball", start: 4, end: 11, frameRate: 30 },
  { key: "fireball-fly", sheet: "fx-fireball", start: 12, end: 27, frameRate: 24, repeat: -1 },
  { key: "frostbolt-launch", sheet: "fx-frostbolt", start: 4, end: 11, frameRate: 30 },
  { key: "frostbolt-fly", sheet: "fx-frostbolt", start: 12, end: 27, frameRate: 24, repeat: -1 },
  { key: "freeze", sheet: "fx-freeze", start: 0, end: 31, frameRate: 40 },
  { key: "explosion", sheet: "fx-explosion", start: 0, end: 25, frameRate: 36 },
  { key: "sparkle", sheet: "fx-sparkle", start: 0, end: 10, frameRate: 22 },
  { key: "lightning-strike", sheet: "fx-lightning-strike", start: 0, end: 8, frameRate: 20 },
  { key: "lightning-burst", sheet: "fx-lightning-burst", start: 0, end: 8, frameRate: 22 },
  { key: "bull-run", sheet: "fx-bull", start: 0, end: 6, frameRate: 16, repeat: -1 },
];

/** Soft particle textures (Kenney, CC0) tinted per spell for trails and bursts. */
const FX_PARTICLES = ["flame-4", "magic-3", "star-6"] as const;

/**
 * How each thrown bolt flies: its animated sheet, where the orb sits in the frame,
 * its size, and the particle texture streaming behind it.
 */
const PROJECTILE_ART: Record<Thrown, { key: string; launch: string; fly: string; originX: number; size: number; trail: string; glow: number }> = {
  fireball: { key: "fx-fireball", launch: "fireball-launch", fly: "fireball-fly", originX: 0.63, size: 115, trail: "flame-4", glow: 0xff6a1f },
  ice: { key: "fx-frostbolt", launch: "frostbolt-launch", fly: "frostbolt-fly", originX: 0.63, size: 108, trail: "magic-3", glow: 0x6fb8ff },
};

/** Fulmen's bolt: a white core inside a pale-blue glow. */
const LIGHTNING = { core: 0xffffff, glow: 0x9fd8ff };

/** Taurus: burnt orange, with a bright ember highlight and pale horn. */
const BULL = { orange: 0xbf5700, ember: 0xff8a3c, horn: 0xfff4de, dust: [0xc8a27a, 0x9c7a58, 0xe0c39a] };
const HORNS = "longhorn-horns";
/** Where each run frame's head sits (sheet pixels), so the drawn horns ride the gallop. */
const BULL_HEAD = [[170, 63], [170, 70], [175, 73], [168, 70], [166, 74], [161, 75], [158, 75]];
const BULL_FRAME = { width: 222, height: 162, feet: 0.95 };
/** Horn texture size and where the head sits in it. */
const HORN_TEX = { width: 132, height: 48, headX: 62, headY: 34 };

/** Animated impacts layered on hit; Fulmen's bolt and ground strike are drawn by strike(). */
const IMPACT_FX: Record<Bolt, { anim: string; size: number; still?: { key: string; size: number } }[]> = {
  fireball: [{ anim: "explosion", size: 180 }],
  ice: [{ anim: "freeze", size: 180 }],
  ultimate: [{ anim: "sparkle", size: 230 }],
  taurus: [{ anim: "sparkle", size: 200 }],
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
  private posePausedAt: number | null = null;
  private storms = new Map<string, StormView>();
  private bulls = new Map<string, BullView>();
  private gloom!: Phaser.GameObjects.Rectangle;
  private beams!: StruggleBeams;
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
    const { state } = frame;
    // Rebuild when the synced map arrives or the stage was resized since the last build.
    if (mapFor(frame) !== this.builtMap || this.sizeKey() !== this.builtSize) return this.scene.restart();
    if (!state) return;
    const now = state.struggle?.kind === "pose" ? state.struggle.startedAt : frame.now;
    if (state.struggle?.kind === "pose") this.posePausedAt ??= state.struggle.startedAt;
    else if (this.posePausedAt !== null) {
      const endedAt = this.queue.find((event) => event.type === "SPELL_CLASH")?.at ?? state.now;
      for (const release of this.releases.values()) release.at += Math.max(0, endedAt - this.posePausedAt);
      this.posePausedAt = null;
    }
    for (const event of this.queue.splice(0)) this.react(event, time);
    for (const slot of ["A", "B"] as PlayerSlot[]) this.updateWizard(slot, state, now, time, delta);
    this.updateProjectiles(state.projectiles, now);
    const flying = new Set(state.projectiles.map((p) => p.id));
    this.beams.update(
      time,
      state.struggle,
      { A: this.wizards.A.rig.handPoint(), B: this.wizards.B.rig.handPoint() },
      (id) => (flying.has(id) ? this.lastPositions.get(id) : undefined),
    );
  }

  // ---------- layout ----------

  private sizeKey() {
    const { top, bottom } = this.getFrame().insets;
    return `${Math.round(this.scale.width)}x${Math.round(this.scale.height)}:${Math.round(top)}:${Math.round(bottom)}`;
  }

  private anchor(slot: PlayerSlot) {
    const { width } = this.scale;
    const left = this.getFrame().leftSlot === slot;
    return { x: width * (left ? 0.14 : 0.86), y: this.groundY, facing: left ? 1 : -1 };
  }

  /** Where spells strike a wizard (chest height, just in front of them). */
  private castPoint(slot: PlayerSlot) {
    const { x, y, facing } = this.anchor(slot);
    return { x: x + facing * 18 * this.unit, y: y - 66 * this.unit };
  }

  private build() {
    const { width, height } = this.scale;
    // Wizards are rebuilt, so their faces get reapplied on the next frame.
    for (const face of Object.values(this.faces)) if (face && this.textures.exists(face.key)) this.textures.remove(face.key);
    this.faces = {};
    const { top, bottom } = this.getFrame().insets;
    // Size wizards to the open band between the floating HUD and the spell cards.
    this.unit = Math.max(0.5, Math.min(1.3, (height - top - bottom) / 430));
    this.projectiles.clear();
    this.lastPositions.clear();
    this.releases.clear();
    this.storms.clear();
    this.bulls.clear();
    this.builtMap = mapFor(this.getFrame());
    this.builtSize = this.sizeKey();
    this.drawBackdrop(width, height);
    this.wizards = { A: this.makeWizard("A"), B: this.makeWizard("B") };
    this.beams = new StruggleBeams(this, this.unit, SPARK);
    // Darkens the arena while Fulmen gathers; the strike lights it back up.
    this.gloom = this.add.rectangle(0, 0, width, height, palette.night).setOrigin(0).setDepth(4).setAlpha(0);
  }

  private drawBackdrop(width: number, height: number) {
    const insets = this.getFrame().insets;
    // The brick path sits just above the spell cards so the wizards are never covered.
    this.groundY = height - insets.bottom - 12 * this.unit;
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
      const y = insets.top + ledge.y * band;
      const branch = this.add.image(width * ledge.x, y, "platform-upper");
      branch.setScale((width * ledge.width) / branch.width);
      if (ledge.flipX) branch.setFlipX(true);
      this.tweens.add({
        targets: branch,
        y: branch.y - (ledge.bob ?? 5) * this.unit,
        duration: 2600 + ledge.x * 1200,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
  }

  private makeWizard(slot: PlayerSlot): WizardView {
    const { x, y, facing } = this.anchor(slot);
    // The rig is drawn facing right; mirroring the root turns the right-hand wizard around.
    const root = this.add.container(x, y).setScale(this.unit * facing, this.unit).setDepth(3);
    const shadow = this.add.ellipse(0, 3, 72, 14, 0x000000, 0.3);
    const aura = this.sized("ultimate-aura", 0, -68, 165).setVisible(false);
    const haste = this.sized("haste", 0, -2, 90).setScale(0, 0).setVisible(false);
    const rig = new WizardRig(this, slot);
    const body = rig.container;
    const shield = this.sized("shield", 3, -65, 150).setVisible(false);
    const frost = this.sized("frozen", 1, -76, 185).setVisible(false);
    const empower = this.sized("empower", 0, -162, 40).setVisible(false);
    root.add([shadow, aura, haste, body, shield, frost, empower]);
    return { root, body, rig, shield, frost, aura, empower, haste, transformed: null, fallen: false };
  }

  /** An image whose larger side is `size` units. */
  private sized(key: string, x: number, y: number, size: number) {
    const image = this.add.image(x, y, key);
    image.setScale(size / Math.max(image.width, image.height));
    image.setData("base", image.scaleX);
    return image;
  }

  // ---------- per-frame ----------

  /** Face image currently on each wizard, and a counter for unique texture keys. */
  private faces: Partial<Record<PlayerSlot, { url: string; key: string }>> = {};
  private faceSeq = 0;

  /** Swaps in the player's newest webcam face once its texture has decoded. */
  private syncFace(slot: PlayerSlot) {
    const url = getFlair(slot).face;
    const current = this.faces[slot];
    if (url === current?.url) return;
    if (!url) {
      this.wizards[slot].rig.setFace(null);
      if (current) this.textures.remove(current.key);
      delete this.faces[slot];
      return;
    }
    const key = `face-${slot}-${++this.faceSeq}`;
    this.faces[slot] = { url, key };
    this.textures.once(`addtexture-${key}`, () => {
      if (this.faces[slot]?.key !== key) return this.textures.remove(key);
      this.wizards[slot]?.rig.setFace(key);
      if (current && this.textures.exists(current.key)) this.textures.remove(current.key);
    });
    this.textures.addBase64(key, url);
  }

  private updateWizard(slot: PlayerSlot, state: MatchState, now: number, time: number, delta: number) {
    const view = this.wizards[slot];
    const player = state.players[slot];
    this.syncFace(slot);
    view.rig.setCheering(state.phase === "finished" && state.winner === slot);
    view.rig.update(time, delta, now < player.frozenUntil);
    const finishedLoser = state.phase === "finished" && state.winner && state.winner !== slot;

    if (finishedLoser) {
      if (!view.fallen) {
        view.fallen = true;
        for (const layer of [view.shield, view.frost, view.aura, view.empower, view.haste]) layer.setVisible(false);
        view.rig.die(time, () => this.transform(slot, state.loserForm));
      }
      return;
    }
    if (view.fallen) {
      view.transformed?.destroy();
      view.transformed = null;
      view.fallen = false;
      view.body.setVisible(true);
      view.rig.revive();
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
    // The big aura sprite stayed on for as long as the Fulmen meter was full (Incendio casts fill it),
    // which read as a stuck graphic. "Ultimate ready" is shown by the HUD meter and the staff glow instead.
    view.aura.setVisible(false);

    const empowered = now < player.empoweredUntil;
    view.empower.setVisible(empowered);
    if (empowered) view.empower.setY(-162 + Math.sin(now / 300) * 4).setRotation(Math.sin(now / 500) * 0.15);

    const hasted = now < player.hasteUntil;
    view.haste.setVisible(hasted);
    if (hasted) view.haste.setScale(base(view.haste), base(view.haste) * 0.35).setRotation(-now / 160);

    view.rig.setCharged(charged);
  }

  private updateProjectiles(list: Projectile[], now: number) {
    this.updateStorms(list.filter((p) => p.spell === "ultimate"), now);
    this.updateBulls(list.filter((p) => p.spell === "taurus"), now);
    list = list.filter((p) => p.spell !== "ultimate" && p.spell !== "taurus");
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
      if (release && !view.node.visible) this.launch(view, projectile.spell as Thrown);
      view.node.setVisible(Boolean(release));
      view.trail.emitting = Boolean(release);
      if (!release) continue;
      const { from, at: releaseAt } = release;
      const to = this.castPoint(opponentOf(projectile.owner));
      const t = Phaser.Math.Clamp((now - releaseAt) / Math.max(1, projectile.arrivesAt - releaseAt), 0, 1);
      const x = Phaser.Math.Linear(from.x, to.x, t);
      const arc = Math.sin(t * Math.PI) * 26 * this.unit;
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
    const look = PROJECTILE_ART[projectile.spell as Thrown];
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

  /** The moment a bolt leaves the hand: its launch animation into the looping flight. */
  private launch(view: ProjectileView, spell: Thrown) {
    const look = PROJECTILE_ART[spell];
    view.node.play(look.launch).chain(look.fly);
  }

  // ---------- taurus ----------

  /** Bulls wait in the rune until the caster's stomp, then gallop to the target and run straight through. */
  private updateBulls(list: Projectile[], now: number) {
    const live = new Set(list.map((p) => p.id));
    for (const [id, bull] of this.bulls) {
      if (live.has(id)) continue;
      this.bulls.delete(id);
      this.releases.delete(id);
      this.dissolveBull(bull);
    }
    for (const projectile of list) {
      const release = this.releases.get(projectile.id);
      const fallbackAt = projectile.launchedAt + RELEASE_MS.taurus + RELEASE_FALLBACK_MS;
      if (!release && now < fallbackAt) continue;
      let bull = this.bulls.get(projectile.id);
      if (!bull) {
        bull = this.makeBull(projectile.owner);
        this.bulls.set(projectile.id, bull);
      }
      const releaseAt = release?.at ?? fallbackAt;
      const from = this.anchor(projectile.owner);
      const to = this.anchor(opponentOf(projectile.owner));
      const t = Phaser.Math.Clamp((now - releaseAt) / Math.max(1, projectile.arrivesAt - releaseAt), 0, 1);
      // Ease in from a standing start, then full charge.
      const run = t < 0.25 ? 2 * t * t * 4 * 0.25 : 0.125 + (t - 0.25) * (0.875 / 0.75);
      const x = Phaser.Math.Linear(from.x + bull.dir * 20 * this.unit, to.x, run);
      this.placeBull(bull, x, this.groundY + 2 * this.unit);
    }
  }

  private makeBull(owner: PlayerSlot): BullView {
    const dir = this.anchor(owner).facing;
    const scale = (125 * this.unit) / BULL_FRAME.height;
    const body = this.add.sprite(0, 0, "fx-bull").setOrigin(0.5, BULL_FRAME.feet).setScale(scale).setDepth(6).setFlipX(dir < 0);
    body.setTint(0xffb070).play("bull-run");
    body.preFX?.addGlow(BULL.ember, 4, 0, false, 0.1, 14);
    const glow = this.add.sprite(0, 0, "fx-bull").setOrigin(0.5, BULL_FRAME.feet).setScale(scale).setDepth(6).setFlipX(dir < 0);
    glow.setTintFill(BULL.orange).setAlpha(0.55).setBlendMode(Phaser.BlendModes.ADD).play("bull-run");
    const horns = this.add.image(0, 0, HORNS).setScale(scale).setDepth(7).setFlipX(dir < 0);
    horns.setOrigin((dir > 0 ? HORN_TEX.headX : HORN_TEX.width - HORN_TEX.headX) / HORN_TEX.width, HORN_TEX.headY / HORN_TEX.height);
    horns.preFX?.addGlow(BULL.ember, 3, 0, false, 0.1, 10);
    const dust = this.add.particles(0, 0, "magic-3", {
      speedX: { min: -dir * 140, max: -dir * 40 },
      speedY: { min: -60, max: -10 },
      lifespan: { min: 400, max: 800 },
      scale: { start: 0.35 * this.unit, end: 1 * this.unit },
      alpha: { start: 0.55, end: 0 },
      rotate: { min: 0, max: 360 },
      tint: BULL.dust,
      frequency: 18,
    });
    dust.setDepth(5);
    const embers = this.add.particles(0, 0, "flame-4", {
      speedX: { min: -dir * 90, max: -dir * 20 },
      speedY: { min: -70, max: -20 },
      lifespan: { min: 300, max: 600 },
      scale: { start: 0.3 * this.unit, end: 0 },
      tint: [BULL.orange, BULL.ember],
      blendMode: "ADD",
      frequency: 30,
    });
    embers.setDepth(6);
    return { body, glow, horns, dust, embers, dir, lastX: 0 };
  }

  private placeBull(bull: BullView, x: number, y: number) {
    const scale = bull.body.scaleX;
    bull.body.setPosition(x, y);
    bull.glow.setPosition(x, y).setFrame(bull.body.frame.name);
    const [hx, hy] = BULL_HEAD[Number(bull.body.frame.name) % BULL_HEAD.length];
    bull.horns.setPosition(x + (hx - BULL_FRAME.width / 2) * scale * bull.dir, y + (hy - BULL_FRAME.height * BULL_FRAME.feet) * scale);
    bull.dust.setPosition(x - bull.dir * 30 * this.unit, y);
    bull.embers.setPosition(x - bull.dir * 20 * this.unit, y - 50 * this.unit);
    bull.lastX = x;
  }

  /** Past the target the bull keeps running and burns away into embers. */
  private dissolveBull(bull: BullView) {
    bull.dust.stop();
    bull.embers.stop();
    const parts = [bull.body, bull.glow, bull.horns];
    this.tweens.add({
      targets: parts,
      x: `+=${bull.dir * 60 * this.unit}`,
      alpha: 0,
      duration: 320,
      ease: "Quad.easeOut",
      onComplete: () => parts.forEach((part) => part.destroy()),
    });
    this.burst(bull.lastX, this.groundY - 50 * this.unit, BULL.ember, 22, 1.2);
    this.time.delayedCall(900, () => {
      bull.dust.destroy();
      bull.embers.destroy();
    });
  }

  /** The caster's stomp: a burnt-orange rune flares on the ground and the bull bursts out of it. */
  private summonRune(slot: PlayerSlot) {
    const { x, facing } = this.anchor(slot);
    const cx = x + facing * 20 * this.unit;
    const y = this.groundY;
    const rune = this.add.graphics({ x: cx, y }).setDepth(4).setBlendMode(Phaser.BlendModes.ADD);
    const r = 70 * this.unit;
    rune.lineStyle(4 * this.unit, BULL.ember, 1).strokeEllipse(0, 0, r * 2, r * 0.6);
    rune.lineStyle(2 * this.unit, BULL.orange, 1).strokeEllipse(0, 0, r * 1.5, r * 0.45);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const [cos, sin] = [Math.cos(a), Math.sin(a)];
      rune.lineBetween(cos * r * 0.75, sin * r * 0.225, cos * r, sin * r * 0.3);
    }
    rune.setScale(0.3);
    this.tweens.add({ targets: rune, scale: 1.15, duration: 260, ease: "Back.easeOut" });
    this.tweens.add({ targets: rune, alpha: 0, delay: 420, duration: 420, onComplete: () => rune.destroy() });
    this.dustBurst(cx, y, 18, 1);
    this.burst(cx, y - 10 * this.unit, BULL.ember, 16, 1);
    this.floatText(x, y - 160 * this.unit, "HOOK 'EM!", "#ff8a3c");
  }

  /** A low cloud of kicked-up dirt. */
  private dustBurst(x: number, y: number, count: number, power: number) {
    const dust = this.add.particles(x, y, "magic-3", {
      speedX: { min: -160 * power, max: 160 * power },
      speedY: { min: -90 * power, max: -10 },
      lifespan: { min: 500, max: 900 },
      scale: { start: 0.4 * this.unit, end: 1.3 * this.unit },
      alpha: { start: 0.6, end: 0 },
      rotate: { min: 0, max: 360 },
      tint: BULL.dust,
      emitting: false,
    });
    dust.setDepth(5);
    dust.explode(count);
    this.time.delayedCall(1000, () => dust.destroy());
  }

  /** The horn toss: a ground shockwave, a dust blast and a hard knockback. */
  private gore(target: PlayerSlot) {
    const { x, y } = this.anchor(target);
    const ring = this.add.graphics({ x, y }).setDepth(4).setBlendMode(Phaser.BlendModes.ADD);
    ring.lineStyle(6 * this.unit, BULL.ember, 1).strokeEllipse(0, 0, 100 * this.unit, 30 * this.unit);
    ring.setScale(0.4);
    this.tweens.add({ targets: ring, scale: 2.4, alpha: 0, duration: 520, ease: "Quad.easeOut", onComplete: () => ring.destroy() });
    this.dustBurst(x, y, 30, 1.5);
  }

  // ---------- fulmen ----------

  /** Storm clouds build over each Fulmen target; when the engine resolves the spell, lightning falls. */
  private updateStorms(list: Projectile[], now: number) {
    const live = new Set(list.map((p) => p.id));
    for (const [id, storm] of this.storms) {
      if (live.has(id)) continue;
      this.storms.delete(id);
      this.strike(storm);
    }
    let gloom = 0;
    for (const projectile of list) {
      let storm = this.storms.get(projectile.id);
      if (!storm) {
        storm = this.makeStorm(opponentOf(projectile.owner));
        this.storms.set(projectile.id, storm);
      }
      const t = Phaser.Math.Clamp((now - projectile.launchedAt) / Math.max(1, projectile.arrivesAt - projectile.launchedAt), 0, 1);
      storm.cloud.frequency = Phaser.Math.Linear(70, 18, t);
      storm.sparks.frequency = Phaser.Math.Linear(260, 50, t);
      gloom = Math.max(gloom, t * 0.45);
    }
    if (this.storms.size > 0) this.gloom.setAlpha(gloom);
  }

  private stormY() {
    return this.getFrame().insets.top + 40 * this.unit;
  }

  private makeStorm(target: PlayerSlot): StormView {
    const x = this.anchor(target).x;
    const y = this.stormY();
    const spread = { min: -90 * this.unit, max: 90 * this.unit };
    const cloud = this.add.particles(x, y, "magic-3", {
      x: spread,
      y: { min: -24 * this.unit, max: 24 * this.unit },
      speedX: { min: -14, max: 14 },
      speedY: { min: -6, max: 6 },
      lifespan: { min: 1200, max: 1800 },
      scale: { start: 1.1 * this.unit, end: 1.6 * this.unit },
      alpha: { start: 0.7, end: 0 },
      rotate: { min: 0, max: 360 },
      tint: [0x1c1236, 0x2e2850, 0x3a3560],
      frequency: 70,
    });
    cloud.setDepth(5);
    const sparks = this.add.particles(x, y, "star-6", {
      x: spread,
      y: { min: 0, max: 30 * this.unit },
      speed: { min: 10, max: 50 },
      lifespan: { min: 120, max: 260 },
      scale: { start: 0.5 * this.unit, end: 0 },
      tint: [LIGHTNING.glow, LIGHTNING.core],
      blendMode: "ADD",
      frequency: 260,
    });
    sparks.setDepth(6);
    return { target, cloud, sparks };
  }

  /** A forked bolt from the cloud to the target's feet, flickering a few times before it fades. */
  private strike(storm: StormView) {
    storm.sparks.destroy();
    storm.cloud.stop();
    this.time.delayedCall(1800, () => storm.cloud.destroy());

    const { x, y } = this.anchor(storm.target);
    const top = this.stormY();
    const bolt = this.add.graphics().setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
    const flickers = [0, 70, 150, 230];
    flickers.forEach((delay) => this.time.delayedCall(delay, () => this.drawLightning(bolt, x, top, y)));
    this.tweens.add({ targets: bolt, alpha: 0, delay: 300, duration: 260, onComplete: () => bolt.destroy() });

    this.playFx("lightning-strike", x, y - 42 * this.unit, 180);
    this.playFx("lightning-burst", x, y - 66 * this.unit, 216);
    this.burst(x, y, LIGHTNING.glow, 26, 1.6);
    this.cameras.main.flash(220, 220, 240, 255);
    if (this.storms.size === 0) this.tweens.add({ targets: this.gloom, alpha: 0, delay: 120, duration: 500 });
  }

  private drawLightning(g: Phaser.GameObjects.Graphics, x: number, top: number, bottom: number) {
    g.clear();
    const trunk = this.jagged(x, top, x + Phaser.Math.Between(-12, 12) * this.unit, bottom, 14, 34);
    const branches = [0.3, 0.5, 0.7].map((at) => {
      const from = trunk[Math.floor(at * (trunk.length - 1))];
      const reach = (bottom - top) * Phaser.Math.FloatBetween(0.12, 0.22);
      return this.jagged(from.x, from.y, from.x + (Math.random() < 0.5 ? -reach : reach), from.y + reach, 5, 16);
    });
    // Wide soft glow, then a narrower bright glow, then the white-hot core.
    for (const [width, color, alpha] of [[22, LIGHTNING.glow, 0.18], [9, LIGHTNING.glow, 0.5], [3.5, LIGHTNING.core, 1]] as const) {
      g.lineStyle(width * this.unit, color, alpha);
      g.strokePoints(trunk);
      g.lineStyle(width * 0.5 * this.unit, color, alpha);
      for (const branch of branches) g.strokePoints(branch);
    }
  }

  /** A line from one point to another with its midpoints knocked sideways. */
  private jagged(x1: number, y1: number, x2: number, y2: number, segments: number, jitter: number) {
    const points = [{ x: x1, y: y1 }];
    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      points.push({ x: Phaser.Math.Linear(x1, x2, t) + Phaser.Math.FloatBetween(-1, 1) * jitter * this.unit, y: Phaser.Math.Linear(y1, y2, t) });
    }
    points.push({ x: x2, y: y2 });
    return points;
  }

  /** The caster's raised hand sends a spark up into the clouds. */
  private callLightning(hand: { x: number; y: number }) {
    const zap = this.add.graphics().setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
    const points = this.jagged(hand.x, hand.y, hand.x + Phaser.Math.Between(-30, 30) * this.unit, this.stormY(), 9, 14);
    zap.lineStyle(8 * this.unit, LIGHTNING.glow, 0.4).strokePoints(points);
    zap.lineStyle(2.5 * this.unit, LIGHTNING.core, 1).strokePoints(points);
    this.tweens.add({ targets: zap, alpha: 0, duration: 280, onComplete: () => zap.destroy() });
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
            const frame = this.getFrame();
            const releaseAt = frame.state?.struggle?.kind === "pose" ? frame.state.struggle.startedAt : frame.now;
            if (event.projectileId) this.releases.set(event.projectileId, { at: releaseAt, from: hand });
            if (event.spell === "ultimate") this.callLightning(hand);
            if (event.spell === "taurus") this.summonRune(event.slot);
            this.burst(hand.x, hand.y, color, 14, 0.9);
          },
        });
        break;
      }
      case "SHIELD_SHATTERED": {
        const point = this.castPoint(event.defender);
        this.flash("shield-shatter", point.x, point.y, 220, 620, true);
        this.burst(point.x, point.y, palette.gold, 30, 1.4);
        this.burst(point.x, point.y, BULL.ember, 20, 1.2);
        this.floatText(point.x, point.y - 50 * this.unit, "SHATTERED!", "#ffe7a8");
        break;
      }
      case "DAMAGE_APPLIED":
        this.onHit(event.target, event.amount, event.spell);
        break;
      case "SPELL_BLOCKED": {
        const point = this.castPoint(event.defender);
        this.flash("shield-shatter", point.x, point.y, 170, 520);
        this.burst(point.x, point.y, palette.gold, 18, 1.0);
        this.floatText(point.x, point.y - 36 * this.unit, "BLOCKED!", "#ffe7a8");
        break;
      }
      case "FROZEN": {
        const { x, y } = this.anchor(event.slot);
        this.burst(x, y - 66 * this.unit, palette.frost, 24, 1.0);
        break;
      }
      case "STRUGGLE_START": {
        const point = { x: this.scale.width / 2, y: this.groundY - 66 * this.unit };
        this.flash("clash", point.x, point.y, 180, 500, true);
        this.burst(point.x, point.y, palette.goldSoft, 20, 1.2);
        break;
      }
      case "SPELL_CLASH": {
        const junction = event.challenge ? this.beams.point : null;
        if (event.challenge) this.beams.resolve(time, event.winner, event.survivorId);
        const point = junction ?? event.fizzledIds.map((id) => this.lastPositions.get(id)).find(Boolean) ?? { x: this.scale.width / 2, y: this.groundY - 66 * this.unit };
        this.flash("clash", point.x, point.y, 220, 700, true);
        this.burst(point.x, point.y, palette.goldSoft, 30, 1.6);
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
    const hitX = x + facing * 6 * this.unit;
    const hitY = y - 68 * this.unit;
    for (const fx of IMPACT_FX[spell as Bolt] ?? []) {
      this.playFx(fx.anim, hitX, hitY, fx.size);
      if (fx.still) this.flash(fx.still.key, hitX, hitY, fx.still.size, 560, true);
    }
    this.burst(x, y - 66 * this.unit, spellColor[spell], 10 + amount / 2, 1.0);
    this.floatText(x, y - 150 * this.unit, `-${amount}`, "#ff4f7b");
    // The bull's horn toss throws far harder than its damage alone would.
    if (spell === "taurus") this.gore(target);
    view.rig.knockback(spell === "taurus" ? amount * 2.5 : amount, this.time.now);
  }

  private transform(slot: PlayerSlot, form: MatchState["loserForm"]) {
    const view = this.wizards[slot];
    const { x, y } = this.anchor(slot);
    this.flash("clash", x, y - 60 * this.unit, 180, 800, true);
    this.burst(x, y - 55 * this.unit, palette.lavender, 40, 1.4);
    this.time.delayedCall(120, () => this.burst(x, y - 55 * this.unit, palette.goldSoft, 30, 1.1));
    // The body is already dust (see WizardRig.die); its pieces are still drifting away.
    const critter = this.sized(form, 0, 0, form === "frog" ? 115 : 120).setOrigin(0.5, 0.92);
    const node = this.add.container(0, 0, [critter]).setScale(0.2);
    view.root.add(node);
    view.transformed = node;
    this.tweens.add({ targets: node, scale: 1, duration: 450, ease: "Back.easeOut" });
    this.tweens.add({ targets: node, y: -10, duration: 380, yoyo: true, repeat: -1, ease: "Sine.easeInOut", delay: 500 });
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
      speed: { min: 40 * power, max: 150 * power },
      lifespan: { min: 300, max: 700 },
      scale: { start: 0.55 * this.unit, end: 0 },
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
      .text(x, y, text, { fontFamily: "Cinzel Decorative, serif", fontSize: `${Math.round(22 * this.unit)}px`, color, stroke: "#1c1236", strokeThickness: 5 })
      .setOrigin(0.5)
      .setDepth(10);
    this.tweens.add({ targets: label, y: y - 40 * this.unit, alpha: 0, duration: 900, ease: "Quad.easeOut", onComplete: () => label.destroy() });
  }

  /** A longhorn's sweep seen from the side: the near horn forward, the far horn back, both curling up at the tips. */
  private drawHorns(g: Phaser.GameObjects.Graphics) {
    const { headX: hx, headY: hy } = HORN_TEX;
    const horn = (p0: number[], p1: number[], p2: number[], width: number) => {
      const curve = new Phaser.Curves.QuadraticBezier(new Phaser.Math.Vector2(p0[0], p0[1]), new Phaser.Math.Vector2(p1[0], p1[1]), new Phaser.Math.Vector2(p2[0], p2[1]));
      const points = curve.getPoints(16);
      const left: Phaser.Math.Vector2[] = [];
      const right: Phaser.Math.Vector2[] = [];
      points.forEach((point, k) => {
        const tangent = curve.getTangent(k / 16);
        const w = width * (1 - k / 16) + 0.6;
        left.push(new Phaser.Math.Vector2(point.x - tangent.y * w, point.y + tangent.x * w));
        right.push(new Phaser.Math.Vector2(point.x + tangent.y * w, point.y - tangent.x * w));
      });
      const outline = [...left, ...right.reverse()];
      g.fillStyle(0x6e370a, 1).fillPoints(outline.map((p) => new Phaser.Math.Vector2(p.x, p.y + 1.5)), true);
      g.fillStyle(BULL.horn, 1).fillPoints(outline, true);
    };
    horn([hx - 4, hy - 2], [hx - 40, hy + 2], [hx - 56, hy - 24], 5);
    horn([hx, hy], [hx + 40, hy + 4], [hx + 62, hy - 26], 6);
  }

  private makeTextures() {
    if (this.textures.exists(SPARK)) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 8);
    g.generateTexture(SPARK, 16, 16);
    g.clear();
    this.drawHorns(g);
    g.generateTexture(HORNS, HORN_TEX.width, HORN_TEX.height);
    g.destroy();
  }
}
