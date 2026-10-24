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
    gesture: "🙌",
    how: "Raise both hands, palms facing the camera",
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
    gesture: "🤘",
    how: "Hook 'em: index and pinky up, middle and ring fingers down",
    spell: "taurus",
    title: `${spells.taurus.name} · Longhorn charge`,
    effect: `${spells.taurus.damage} damage · smashes through shields · ${seconds(spells.taurus.cooldownMs)} cooldown`,
  },
  {
    gesture: "☝️ → 👇",
    how: "Point one finger at the sky until the orb says \u201cDrop it to strike!\u201d, then lower it",
    spell: "ultimate",
    title: `${spells.ultimate.name} · Ultimate`,
    effect: `${spells.ultimate.damage} damage · needs a full meter`,
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
