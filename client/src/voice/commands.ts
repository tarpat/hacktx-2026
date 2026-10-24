import type { SpellId } from "@spellcaster/shared";

export const INCANTATIONS = {
  incendio: "fireball", protego: "shield", glacius: "ice", fulmen: "ultimate",
} as const satisfies Record<string, SpellId>;

export function incantationFor(spell: SpellId): string {
  return Object.entries(INCANTATIONS).find(([, value]) => value === spell)![0];
}

/** Exact command vocabulary; never match conversation, substrings or fuzzy guesses. */
export function spellsFromTranscript(transcript: string): SpellId[] {
  if (transcript.length > 500) return [];
  const text = transcript.normalize("NFKC").toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ").trim().replace(/\s+/g, " ").replace(/^cast /, "");
  if (!text) return [];
  const words = text.split(" ");
  if (!words.every((word) => Object.hasOwn(INCANTATIONS, word))) return [];
  return words.map((word) => INCANTATIONS[word as keyof typeof INCANTATIONS]);
}

export function spellFromTranscript(transcript: string): SpellId | null {
  const spells = spellsFromTranscript(transcript);
  return spells.length === 1 ? spells[0] : null;
}
