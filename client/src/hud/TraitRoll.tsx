import { useEffect, useState } from "react";
import { DEFAULT_MATCH_CONFIG, TRAIT_ORDER, type MatchState, type PlayerSlot, type TraitId } from "@spellcaster/shared";
import { sfx } from "../audio/sound";
import { playerName, traitGlyph } from "../theme";

/** The left reel stops first and the right one a beat later, both well before "1". */
const LAND_MS = [1_400, 1_900];

/** Slot-machine reveal of both wizards' traits during the opening countdown. */
export function TraitRoll({ state, leftSlot, hotseat }: { state: MatchState; leftSlot: PlayerSlot; hotseat: boolean }) {
  const slots: PlayerSlot[] = [leftSlot, leftSlot === "A" ? "B" : "A"];
  if (state.phase !== "countdown" || slots.some((slot) => !state.players[slot].trait)) return null;
  return (
    // Remount (and spin again) whenever a new match or a training reroll brings new traits.
    <div className="trait-roll" key={`${state.phaseEndsAt}:${state.players.A.trait}:${state.players.B.trait}`}>
      {slots.map((slot, i) => (
        <TraitReel
          key={slot}
          slot={slot}
          trait={state.players[slot].trait!}
          side={i === 0 ? "left" : "right"}
          who={hotseat ? playerName[slot] : slot === leftSlot ? "You" : "Rival"}
          landMs={LAND_MS[i]}
        />
      ))}
    </div>
  );
}

function TraitReel({ slot, trait, side, who, landMs }: { slot: PlayerSlot; trait: TraitId; side: "left" | "right"; who: string; landMs: number }) {
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    const timeout = setTimeout(() => {
      setLanded(true);
      sfx.click();
    }, landMs);
    return () => clearTimeout(timeout);
  }, [landMs]);
  // Two full turns of the reel, then on to the rolled trait.
  const strip = [...TRAIT_ORDER, ...TRAIT_ORDER, ...TRAIT_ORDER.slice(0, TRAIT_ORDER.indexOf(trait) + 1)];
  const { name, effect } = DEFAULT_MATCH_CONFIG.traits[trait];
  return (
    <div
      className={`trait-card ${side} player-${slot}${landed ? " landed" : ""}`}
      style={{ "--spin-ms": `${landMs}ms`, "--stops": strip.length - 1 } as React.CSSProperties}
    >
      <span className="trait-who">{who} rolled</span>
      <div className="trait-window" aria-hidden="true">
        <ol className="trait-strip">
          {strip.map((id, i) => (
            <li key={i}>
              <span>{traitGlyph[id]}</span> {DEFAULT_MATCH_CONFIG.traits[id].name}
            </li>
          ))}
        </ol>
      </div>
      <p className="trait-effect" role="status" aria-label={landed ? `${who} rolled ${name}: ${effect}` : undefined}>
        {landed ? effect : "…"}
      </p>
    </div>
  );
}
