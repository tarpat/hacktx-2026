import type { SpellId } from "@spellcaster/shared";
import { socket } from "./socket";

/** Shared input bridge for gestures, keyboard fallback, and UI controls. */
export function castSpell(spell: SpellId) {
  socket.emit("CAST_REQUEST", { spell, clientActionId: crypto.randomUUID() });
}

export function setShieldHeld(held: boolean) {
  socket.emit(held ? "DEFEND_START" : "DEFEND_END");
}
