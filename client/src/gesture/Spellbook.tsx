import { DEFAULT_MATCH_CONFIG, type SpellId } from "@spellcaster/shared";

const { spells, shieldGuardMs, freezeMs, ultimateShieldFactor } = DEFAULT_MATCH_CONFIG;
const seconds = (ms: number) => `${+(ms / 1000).toFixed(1)}s`;

interface Entry {
  /** Hand pose shown in the medallion; `then` is the follow-up pose for charged spells. */
  gesture: string;
  then?: string;
  how: string;
  spell: SpellId;
  kind: string;
  effects: string[];
}

/** Every card reads the same way: a one-line gesture, then damage · effect · timing. */
const ENTRIES: Entry[] = [
  {
    gesture: "✊",
    then: "✋",
    how: "Make a fist, then open your hand",
    spell: "fireball",
    kind: "Fireball",
    effects: [`${spells.fireball.damage} damage`, "Clashes mid-air", `${seconds(spells.fireball.cooldownMs)} cooldown`],
  },
  {
    gesture: "🙌",
    how: "Raise both palms to the camera",
    spell: "shield",
    kind: "Shield",
    effects: ["No damage", `Blocks for ${seconds(shieldGuardMs)}`, `${seconds(spells.shield.cooldownMs)} cooldown`],
  },
  {
    gesture: "✌️",
    how: "Hold up a peace sign",
    spell: "ice",
    kind: "Ice",
    effects: [`${spells.ice.damage} damage`, `Freezes for ${seconds(freezeMs)}`, `${seconds(spells.ice.cooldownMs)} cooldown`],
  },
  {
    gesture: "🤘",
    how: "Raise your index and pinky fingers",
    spell: "taurus",
    kind: "Longhorn Charge",
    effects: [`${spells.taurus.damage} damage`, "Breaks shields", `${seconds(spells.taurus.cooldownMs)} cooldown`],
  },
  {
    gesture: "☝️",
    then: "👇",
    how: "Point up, then drop your finger",
    spell: "ultimate",
    kind: "Ultimate",
    effects: [`${spells.ultimate.damage} damage`, `${Math.round(ultimateShieldFactor * 100)}% through shields`, "Needs a full meter"],
  },
];

/** Gesture cheat sheet on the home page. Numbers come from the engine config. */
export function Spellbook() {
  return (
    <section className="spellbook" aria-label="Spellbook">
      {ENTRIES.map((entry) => (
        <article key={entry.spell} className="spellbook-card">
          <div className="gesture-medallion">
            <i>{entry.gesture}</i>
            {entry.then && <span className="spellbook-then">{entry.then}</span>}
          </div>
          <b>{spells[entry.spell].name}</b>
          <span className="spellbook-kind">{entry.kind}</span>
          <p>{entry.how}</p>
          <ul className="spellbook-effects">
            {entry.effects.map((effect) => <li key={effect}>{effect}</li>)}
          </ul>
        </article>
      ))}
    </section>
  );
}
