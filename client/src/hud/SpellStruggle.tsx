import { DuelEngine, type MatchState, type PlayerSlot } from "@spellcaster/shared";
import { PUSH_KEYS } from "../game/input";
import { playerName, spellGlyph } from "../theme";

interface SpellStruggleProps {
  state: MatchState;
  now: number;
  /** The wizard drawn on the left (the local player online). */
  leftSlot: PlayerSlot;
  hotseat: boolean;
}

// Where the arena's cast points sit across the stage, so the clash orb lines up with the spells.
const LANE_LEFT = 19;
const LANE_RIGHT = 81;

/**
 * Live tug-of-war for a same-spell clash: the locked spells sit where they're being
 * shoved to, and the bar shows who's winning while both players pump to push.
 */
export function SpellStruggle({ state, now, leftSlot, hotseat }: SpellStruggleProps) {
  const struggle = state.struggle;
  if (!struggle) return null;
  const rightSlot: PlayerSlot = leftSlot === "A" ? "B" : "A";

  // Balance is +1 toward B; flip it so positive always means the left wizard is winning.
  const lead = leftSlot === "A" ? struggle.balance : -struggle.balance;
  const positionFromA = DuelEngine.strugglePosition(struggle);
  const screen = leftSlot === "A" ? positionFromA : 1 - positionFromA;
  const secondsLeft = Math.max(0, (struggle.endsAt - now) / 1000);
  const timeShare = Math.max(0, Math.min(1, (struggle.endsAt - now) / (struggle.endsAt - struggle.startedAt)));
  const status = Math.abs(lead) < 0.1 ? "Dead even!" : lead > 0 ? `${hotseat ? playerName[leftSlot] : "You're"} winning!` : `${hotseat ? playerName[rightSlot] : "Rival"} is winning!`;
  const howTo = hotseat
    ? `Left: SPACE · Right: ${PUSH_KEYS.secondary.toUpperCase()} · or pump your fist`
    : "✊✋ Pump your fist as fast as you can! (or mash SPACE)";

  return (
    <>
      <div className="struggle-orb" style={{ left: `${LANE_LEFT + (LANE_RIGHT - LANE_LEFT) * screen}%` }} aria-hidden>
        <span className={`struggle-half player-${leftSlot}`} />
        <span className={`struggle-half player-${rightSlot}`} />
        <b>{spellGlyph[struggle.spell]}</b>
      </div>

      <section className={`struggle${lead > 0.1 ? " winning" : lead < -0.1 ? " losing" : ""}`} aria-live="polite">
        <header>
          <span>⚔️ SPELL CLASH ⚔️</span>
          <b className="struggle-timer" style={{ "--time": `${timeShare * 360}deg` } as React.CSSProperties}>
            {secondsLeft.toFixed(1)}
          </b>
        </header>

        <div className="struggle-bar">
          <i className={`player-${leftSlot}`} style={{ width: `${50 + lead * 50}%` }} />
          <i className={`player-${rightSlot}`} />
          <em style={{ left: `${50 + lead * 50}%` }} />
        </div>

        <div className="struggle-sides">
          <span className={`player-${leftSlot}`}>
            {hotseat ? playerName[leftSlot] : "YOU"} · {struggle.pushes[leftSlot]}
          </span>
          <strong>{status}</strong>
          <span className={`player-${rightSlot}`}>
            {struggle.pushes[rightSlot]} · {hotseat ? playerName[rightSlot] : "RIVAL"}
          </span>
        </div>

        <p>{howTo}</p>
        {!hotseat && <small>Winner's spell swallows the other and hits for both.</small>}
      </section>
    </>
  );
}
