import type { PlayerSlot, PowerUpId, SpellId } from "@spellcaster/shared";

/**
 * The single entry point for anything that triggers game actions: keyboard fallback,
 * the gesture recognizer and the voice/incantation track all call these functions.
 * `slot` is only needed for local hotseat play; leave it out to act as the local wizard.
 */
export type SpellIntent =
  | { kind: "cast"; spell: SpellId; slot?: PlayerSlot }
  | { kind: "powerUp"; powerUp: PowerUpId; slot?: PlayerSlot };

type Listener = (intent: SpellIntent) => void;
const listeners = new Set<Listener>();

export const spellInput = {
  cast(spell: SpellId, slot?: PlayerSlot) {
    listeners.forEach((listener) => listener({ kind: "cast", spell, slot }));
  },
  powerUp(powerUp: PowerUpId, slot?: PlayerSlot) {
    listeners.forEach((listener) => listener({ kind: "powerUp", powerUp, slot }));
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** The local wizard always uses the primary keys; the hotseat opponent uses the secondary keys. */
export type KeySet = "primary" | "secondary";

export const KEY_BINDINGS: Record<KeySet, Record<string, SpellId>> = {
  primary: { q: "fireball", w: "shield", e: "ice", r: "ultimate" },
  secondary: { u: "fireball", i: "shield", o: "ice", p: "ultimate" },
};

/** Demo keys that stand in for the voice track until it is wired up. */
export const POWER_UP_KEYS: Record<string, PowerUpId> = { "1": "empower", "2": "haste", "3": "heal" };

export const keyFor = (keySet: KeySet, spell: SpellId) =>
  Object.entries(KEY_BINDINGS[keySet]).find(([, bound]) => bound === spell)?.[0].toUpperCase() ?? "";

/** Wires the keyboard fallback. `hotseatSlot` enables the second key set for local two-player play. */
export function bindKeyboard(localSlot: PlayerSlot, hotseatSlot: PlayerSlot | null): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.repeat || event.target instanceof HTMLInputElement) return;
    const key = event.key.toLowerCase();
    const localSpell = KEY_BINDINGS.primary[key];
    const hotseatSpell = KEY_BINDINGS.secondary[key];
    if (localSpell) spellInput.cast(localSpell, localSlot);
    else if (hotseatSpell && hotseatSlot) spellInput.cast(hotseatSpell, hotseatSlot);
    else if (POWER_UP_KEYS[key]) spellInput.powerUp(POWER_UP_KEYS[key], localSlot);
  };
  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}

declare global {
  interface Window {
    spellcaster?: typeof spellInput;
  }
}
// Handy for teammates testing from the browser console: spellcaster.cast("fireball")
window.spellcaster = spellInput;
