import { DEFAULT_MATCH_CONFIG, type SpellId } from "@spellcaster/shared";
import { keyFor } from "../game/input";

const { spells, shieldGuardMs, freezeMs } = DEFAULT_MATCH_CONFIG;
const seconds = (ms: number) => `${+(ms / 1000).toFixed(1)}s`;

interface Entry {
  gesture: string;
  how: string;
  spell: SpellId;
  title: string;
  effect: string;
}

const ENTRIES: Entry[] = [
  {
    gesture: "✊ → ✋",
    how: "Make a fist; when the orb says \u201cOpen your hand!\u201d, open it",
    spell: "fireball",
    title: `${spells.fireball.name} · Fireball`,
    effect: `${spells.fireball.damage} damage · ${seconds(spells.fireball.cooldownMs)} cooldown`,
  },
  {
    gesture: "✋",
    how: "Show one open palm (not straight after a fist)",
    spell: "shield",
    title: `${spells.shield.name} · Shield`,
    effect: `Blocks for ${seconds(shieldGuardMs)} · ${seconds(spells.shield.cooldownMs)} cooldown`,
  },
  {
    gesture: "✌️",
    how: "Hold a peace sign for a moment",
    spell: "ice",
    title: `${spells.ice.name} · Ice`,
    effect: `${spells.ice.damage} damage + freezes ${seconds(freezeMs)} · ${seconds(spells.ice.cooldownMs)} cooldown`,
  },
  {
    gesture: "✊✊ → 🙌",
    how: "Make both fists until the lightning orb says \u201cOpen both hands!\u201d, then open them",
    spell: "ultimate",
    title: `${spells.ultimate.name} · Ultimate`,
    effect: `${spells.ultimate.damage} damage · needs a full meter`,
  },
  {
    gesture: "🫴 ↕ 🫴",
    how: "Elbows by your sides, forearms raised, palms up (keep elbows and hands in frame). Alternate one hand up as the other goes down. Faster = more charge. Hold still to fire",
    spell: "sixSeven",
    title: "Six Seven",
    effect: `Up to ${spells.sixSeven.damage} damage · ${seconds(spells.sixSeven.cooldownMs)} cooldown`,
  },
];

/** Gesture cheat sheet shown under the practice arena. Numbers come from the engine config. */
export function Spellbook() {
  return (
    <section className="spellbook" aria-label="Spellbook">
      {ENTRIES.map((entry) => (
        <article key={entry.title} className="spellbook-card">
          <span className="spellbook-gesture">{entry.gesture}</span>
          <b>{entry.title}</b>
          <p>{entry.how}</p>
          <em>{entry.effect}</em>
          <kbd>{keyFor("primary", entry.spell)}</kbd>
        </article>
      ))}
    </section>
  );
}
