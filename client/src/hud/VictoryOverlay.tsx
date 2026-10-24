import { opponentOf, type MatchState, type PlayerSlot } from "@spellcaster/shared";
import { winnerTitle } from "../game/narration";
import { playerName } from "../theme";

interface VictoryOverlayProps {
  state: MatchState;
  localSlot: PlayerSlot;
  onRematch: () => void;
  rematchLabel: string;
}

const REASON_TEXT = {
  knockout: "by knockout",
  time: "on the clock",
  suddenDeath: "in sudden death",
  draw: "",
};

export function VictoryOverlay({ state, localSlot, onRematch, rematchLabel }: VictoryOverlayProps) {
  if (state.phase !== "finished") return null;
  const { winner, endReason } = state;
  const loser = winner ? opponentOf(winner) : null;
  const form = state.loserForm === "frog" ? "a frog 🐸" : "a teapot 🫖";

  return (
    <div className="victory">
      <div className="victory-card">
        <p className="eyebrow">AND THEY DUELED HAPPILY EVER AFTER</p>
        {winner ? (
          <>
            <h2 className={`player-${winner}`}>{winner === localSlot ? "Victory!" : `${playerName[winner]} wins`}</h2>
            <p className="victory-title">{winnerTitle(state, winner)}</p>
            <p className="victory-detail">
              Won {endReason ? REASON_TEXT[endReason] : ""}. {loser && playerName[loser]} has been turned into {form}.
            </p>
          </>
        ) : (
          <>
            <h2>A draw!</h2>
            <p className="victory-detail">Both wizards bow. The kingdom demands a rematch.</p>
          </>
        )}
        <div className="victory-stats">
          {(["A", "B"] as PlayerSlot[]).map((slot) => {
            const stats = state.players[slot].stats;
            return (
              <div key={slot} className={`player-${slot}`}>
                <b>{playerName[slot]}</b>
                <span>{stats.damageDealt} dmg</span>
                <span>{stats.blocks} blocks</span>
                <span>{stats.hits} hits landed</span>
              </div>
            );
          })}
        </div>
        <button className="primary-button" onClick={onRematch}>
          {rematchLabel} <span>↻</span>
        </button>
      </div>
    </div>
  );
}
