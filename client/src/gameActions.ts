import type { PowerUpId, SpellId } from "@spellcaster/shared";
import { socket } from "./socket";

let actionSeq = 0;
const actionId = () => `${Date.now().toString(36)}-${(++actionSeq).toString(36)}`;

/** Shared network bridge for UI or external input modules. Gesture code can instead use spellInput. */
export function castSpell(spell: SpellId) {
  socket.emit("CAST_REQUEST", { spell, clientActionId: actionId() });
}

export function requestPowerUp(powerUp: PowerUpId) {
  socket.emit("POWER_UP_REQUEST", { powerUp, clientActionId: actionId() });
}
