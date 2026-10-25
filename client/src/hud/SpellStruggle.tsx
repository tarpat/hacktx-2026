import { DuelEngine, type MatchState, type PlayerSlot } from "@spellcaster/shared";
import { spellInput } from "../game/input";
import type { SixSevenFeedback } from "../gesture/sixSevenCounter";
import { playerName, spellGlyph } from "../theme";

interface SpellStruggleProps {
  state: MatchState;
  now: number;
  /** The wizard drawn on the left (the local player online). */
  leftSlot: PlayerSlot;
  hotseat: boolean;
  feedback: SixSevenFeedback;
}

// Where the arena's cast points sit across the stage, so the clash orb lines up with the spells.
const LANE_LEFT = 18;
const LANE_RIGHT = 82;

/**
 * Live tug-of-war for a same-spell clash: the locked spells sit where they're being
 * shoved to, and each 6–7 forearm lift pushes toward the rival.
 */
export function SpellStruggle({ state, now, leftSlot, hotseat, feedback }: SpellStruggleProps) {
  const struggle = state.struggle;
  if (!struggle) return null;
  const rightSlot: PlayerSlot = leftSlot === "A" ? "B" : "A";

  // Balance +1 means A is pushing toward B; flip it so positive always means the left wizard is winning.
  const lead = leftSlot === "A" ? struggle.balance : -struggle.balance;
  const secondsLeft = Math.max(0, (struggle.endsAt - now) / 1000);
  const timeShare = Math.max(0, Math.min(1, (struggle.endsAt - now) / (struggle.endsAt - struggle.startedAt)));
  const status = Math.abs(lead) < 0.1 ? "Dead even!" : lead > 0 ? hotseat ? `${playerName[leftSlot]} is leading!` : "You are leading!" : `${hotseat ? playerName[rightSlot] : "Rival"} is leading!`;

  return (
      <section className={`struggle six-seven${lead > 0.1 ? " winning" : lead < -0.1 ? " losing" : ""}`} aria-label="6–7 collision challenge">
        <header>
          <span>⚔ SPELL CLASH · 6–7</span>
          <b className="struggle-timer" role="timer" aria-label="Challenge time remaining" style={{ "--time": `${timeShare * 360}deg` } as React.CSSProperties}>
            {secondsLeft.toFixed(1)}
          </b>
        </header>

        <h2>6–7 to overpower!</h2>
        <div className={`six-seven-cue${feedback.visible ? " tracked" : " demo"}`} aria-hidden="true">
          <span className={`six-seven-arm${feedback.left === "up" ? " raised" : ""}`}><b>6</b><i>🤚</i></span>
          <span className="six-seven-rhythm">↑ ↓</span>
          <span className={`six-seven-arm${feedback.right === "up" ? " raised" : ""}`}><b>7</b><i>🤚</i></span>
        </div>
        <p className="six-seven-instruction">Palms up. Rock your forearms up and down.<br />Each wrist lift above its elbow scores a beat.</p>
        <div className={`six-seven-tracking${feedback.visible ? " ready" : ""}`} role="status">{feedback.hint}</div>
        <strong className="struggle-leader" aria-live="polite">{status}</strong>

        <div className="struggle-bar" role="progressbar" aria-label="Clash advantage" aria-valuenow={Math.round(50 + lead * 50)} aria-valuemin={0} aria-valuemax={100} aria-valuetext={status}>
          <i className={`player-${leftSlot}`} style={{ width: `${50 + lead * 50}%` }} />
          <i className={`player-${rightSlot}`} />
          <em style={{ left: `${50 + lead * 50}%` }} />
        </div>

        <div className="struggle-sides">
          <span className={`player-${leftSlot}`}>
            {hotseat ? playerName[leftSlot] : "YOU"} · {struggle.pushes[leftSlot]} {struggle.pushes[leftSlot] === 1 ? "beat" : "beats"}
          </span>
          <span className="struggle-versus">VS</span>
          <span className={`player-${rightSlot}`}>
            {struggle.pushes[rightSlot]} {struggle.pushes[rightSlot] === 1 ? "beat" : "beats"} · {hotseat ? playerName[rightSlot] : "RIVAL"}
          </span>
        </div>

        <div className="six-seven-controls">
          <button type="button" onClick={() => spellInput.push(leftSlot)}>{hotseat ? playerName[leftSlot] : "Tap to 6–7"} <kbd>SPACE</kbd></button>
          {hotseat && <button type="button" onClick={() => spellInput.push(rightSlot)}>{playerName[rightSlot]} <kbd>ENTER</kbd></button>}
        </div>
        <small>{hotseat ? `Camera scores ${playerName[leftSlot]}. ` : ""}Build a lead to win. Winner's spell absorbs both attacks.</small>
      </section>
  );
}

export function StruggleOrb({ state, leftSlot }: Pick<SpellStruggleProps, "state" | "leftSlot">) {
  const struggle = state.struggle;
  if (!struggle) return null;
  const rightSlot = leftSlot === "A" ? "B" : "A";
  const position = DuelEngine.strugglePosition(struggle);
  const screen = leftSlot === "A" ? position : 1 - position;
  return <div className="struggle-orb" style={{ left: `${LANE_LEFT + (LANE_RIGHT - LANE_LEFT) * screen}%` }} aria-hidden>
    <span className={`struggle-half player-${leftSlot}`} />
    <span className={`struggle-half player-${rightSlot}`} />
    <b>{spellGlyph[struggle.spell]}</b>
  </div>;
}
