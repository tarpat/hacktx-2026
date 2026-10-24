import type { PlayerSlot, PowerUpId, SpellId } from "@spellcaster/shared";
import type { WizardStyle } from "./arena/WizardRig";

/** Phaser needs numeric colors; keep these in sync with src/theme.css. */
export const palette = {
  night: 0x1c1236,
  night2: 0x2a1a4f,
  dusk: 0x3a2466,
  plum: 0x5b2a86,
  gold: 0xf6c453,
  goldSoft: 0xffe7a8,
  parchment: 0xfff4dc,
  rose: 0xf4a6c0,
  mint: 0x9be38a,
  ember: 0xff8a4c,
  frost: 0xb9d4ff,
  leaf: 0x7ccf6b,
  forest: 0x2f6b3f,
  lavender: 0xb28ddb,
  berry: 0xff4f7b,
};

export const playerColor: Record<PlayerSlot, number> = { A: palette.leaf, B: palette.lavender };

export const playerName: Record<PlayerSlot, string> = { A: "Green Wizard", B: "Purple Wizard" };

export const wizardStyle: Record<PlayerSlot, WizardStyle> = {
  A: { robe: 0x3f8a46, trim: 0x8fd67a, hat: 0x4f9e48, hatBand: 0x2f6b3f, skin: 0xffd9bf, hair: 0xf2c65a, hairStyle: "braid", orb: 0xffe27a },
  B: { robe: 0x5b2a86, trim: 0xb28ddb, hat: 0x4a2173, hatBand: 0xb28ddb, skin: 0xf6dccb, hair: 0x1b1428, hairStyle: "curls", cape: 0x1e1838, orb: 0xc9a8f0 },
};

export const spellColor: Record<SpellId, number> = {
  fireball: palette.ember,
  shield: palette.gold,
  ice: palette.frost,
  ultimate: palette.gold,
};

const asset = (name: string) => `${import.meta.env.BASE_URL}assets/${name}.png`;

/** Illustrated art used by the HUD and the arena. */
export const art = {
  background: `${import.meta.env.BASE_URL}assets/background.jpg`,
  spell: { fireball: asset("fireball"), shield: asset("shield"), ice: asset("ice"), ultimate: asset("fulmen") } as Partial<Record<SpellId, string>>,
  powerUp: { empower: asset("empower"), haste: asset("haste"), heal: null } as Record<PowerUpId, string | null>,
  portrait: { A: asset("portrait-green"), B: asset("portrait-purple") } as Record<PlayerSlot, string>,
  hpFrame: asset("hp-frame"),
  clockFrame: asset("clock-frame"),
  spellTile: asset("spell-tile"),
  frog: asset("frog"),
  teapot: asset("teapot"),
};

/** Texture keys and files the arena loads. */
export const arenaTextures = [
  "path", "ground", "platform-upper",
  "fireball", "fireball-impact", "ice", "fulmen", "fulmen-impact",
  "shield", "shield-shatter", "frozen", "ultimate-aura", "clash", "hit-sparks",
  "empower", "haste", "frog", "teapot",
] as const;

export const textureUrl = asset;

/** Emoji stand-ins for spells without illustrated art. */
export const spellGlyph: Record<SpellId, string> = { fireball: "🔥", shield: "🛡️", ice: "❄️", ultimate: "⚡" };
