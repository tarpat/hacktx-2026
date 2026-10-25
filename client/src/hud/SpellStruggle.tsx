import { compareTraceResults, type MatchState, type PlayerSlot } from "@spellcaster/shared";
import type { CircleChargeFeedback } from "../gesture/circleChargeCounter";
import { playerName } from "../theme";

interface SpellStruggleProps {
  state: MatchState;
  now: number;
  /** The wizard drawn on the left (the local player online). */
  leftSlot: PlayerSlot;
  hotseat: boolean;
  feedback: CircleChargeFeedback;
}

/**
 * Live tug-of-war for a same-spell clash: the locked spells sit where they're being
 * shoved to, and each hand circle pushes toward the rival.
 */
export function SpellStruggle({ state, now, leftSlot, hotseat, feedback }: SpellStruggleProps) {
  const struggle = state.struggle;
  if (!struggle) return null;
  const rightSlot: PlayerSlot = leftSlot === "A" ? "B" : "A";

  // Balance +1 means A is pushing toward B; flip it so positive always means the left wizard is winning.
  const lead = leftSlot === "A" ? struggle.balance : -struggle.balance;
  const secondsLeft = Math.max(0, (struggle.endsAt - now) / 1000);
  const timeShare = Math.max(0, Math.min(1, (struggle.endsAt - now) / (struggle.endsAt - struggle.startedAt)));
  const comparison=compareTraceResults(struggle.traceScores?.[leftSlot] ?? null,struggle.traceScores?.[rightSlot] ?? null);
  const status = comparison === 0 ? "Dead even!" : comparison > 0 ? hotseat ? `${playerName[leftSlot]} is leading!` : "You are leading!" : `${hotseat ? playerName[rightSlot] : "Rival"} is leading!`;

  return (
      <section className={`struggle magic-charge${comparison > 0 ? " winning" : comparison < 0 ? " losing" : ""}`} aria-label="Charge your magic challenge">
        <header>
          <span>⚔ SPELL CLASH · MAGIC CHARGE</span>
          <b className="struggle-timer" role="timer" aria-label="Challenge time remaining" style={{ "--time": `${timeShare * 360}deg` } as React.CSSProperties}>
            {secondsLeft.toFixed(1)}
          </b>
        </header>

        <h2>Charge your magic!</h2>
        <div className="magic-charge-orbit" style={{ "--charge": `${feedback.progress * 360}deg` } as React.CSSProperties} aria-hidden="true"><span>☝️</span><b>↻</b></div>
        <p className="magic-charge-instruction">Point your index finger at the screen.<br />Trace the golden circle precisely and quickly.</p>
        <div className={`magic-charge-tracking${feedback.visible ? " ready" : ""}`} role="status">{feedback.hint}</div>
        <p className="magic-trace-result">{feedback.result ? `${feedback.result.accuracy}% accuracy · ${(feedback.result.durationMs/1000).toFixed(2)}s · ${feedback.result.score}/100` : "Accuracy 80% · speed 20% · best circle wins"}</p>
        <strong className="struggle-leader" aria-live="polite">{status}</strong>

        <div className="struggle-bar" role="progressbar" aria-label="Clash advantage" aria-valuenow={Math.round(50 + lead * 50)} aria-valuemin={0} aria-valuemax={100} aria-valuetext={status}>
          <i className={`player-${leftSlot}`} style={{ width: `${50 + lead * 50}%` }} />
          <i className={`player-${rightSlot}`} />
          <em style={{ left: `${50 + lead * 50}%` }} />
        </div>

        <div className="struggle-sides">
          <span className={`player-${leftSlot}`}>{hotseat ? playerName[leftSlot] : "YOU"} · {struggle.traceScores?.[leftSlot]?.score ?? 0}/100</span>
          <span className="struggle-versus">VS</span>
          <span className={`player-${rightSlot}`}>{struggle.traceScores?.[rightSlot]?.score ?? 0}/100 · {hotseat ? playerName[rightSlot] : "RIVAL"}</span>
        </div>
        <small>{hotseat ? `Camera scores ${playerName[leftSlot]}. ` : ""}You can retry before time runs out. Your best score counts. Winner's spell absorbs both attacks.</small>
      </section>
  );
}
