import type { SpellId } from "@spellcaster/shared";

const commands: Record<string, SpellId> = {
  incendio: "fireball", fireball: "fireball", "fire ball": "fireball",
  protego: "shield", shield: "shield",
  glacius: "ice", ice: "ice",
  fulmen: "ultimate", ultimate: "ultimate",
};

/** A complete, single command only. Conversation and ambiguous commands stay silent. */
export function spellFromTranscript(transcript: string): SpellId | null {
  const normalized = transcript.normalize("NFKC").toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ").trim().replace(/\s+/g, " ")
    .replace(/^cast /, "").replace(/ please$/, "");
  return Object.hasOwn(commands, normalized) ? commands[normalized] : null;
}
