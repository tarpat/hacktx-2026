import type { PlayerSlot, SpellId } from "@spellcaster/shared";

/** Phaser needs numeric colors; keep these in sync with src/theme.css. */
export const palette = {
  night: 0x120d2b,
  night2: 0x1d1645,
  dusk: 0x2e2163,
  plum: 0x4b2c7a,
  gold: 0xf6c453,
  goldSoft: 0xffe7a8,
  parchment: 0xfff4dc,
  rose: 0xf48fb1,
  mint: 0x7fe0c9,
  ember: 0xff7a59,
  frost: 0x8ec5ff,
  leaf: 0x7ed67a,
  berry: 0xff4f7b,
};

export const playerColor: Record<PlayerSlot, number> = { A: palette.rose, B: palette.mint };

export const playerName: Record<PlayerSlot, string> = { A: "Rose Wizard", B: "Moon Wizard" };

export const spellColor: Record<SpellId, number> = {
  fireball: palette.ember,
  shield: palette.gold,
  ice: palette.frost,
  ultimate: palette.gold,
  sixSeven: palette.rose,
};

export const spellGlyph: Record<SpellId, string> = { fireball: "🔥", shield: "🛡️", ice: "❄️", ultimate: "⚡", sixSeven: "🫴" };
