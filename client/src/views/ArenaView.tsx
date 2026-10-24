import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { opponentOf } from "@spellcaster/shared";
import { OnlineDuel } from "../game/duelSource";
import { DuelScreen } from "../hud/DuelScreen";
import { setSession, useSession, type Session } from "../session";
import { socket } from "../socket";
import { playerName } from "../theme";

export function ArenaView() {
  const session = useSession();
  if (!session) {
    return (
      <main className="shell secondary-shell">
        <section className="calibration">
          <p className="eyebrow">NO DUEL FOUND</p>
          <h1>The arena is empty</h1>
          <p className="intro">Create or join a duel from the lobby, or warm up against the training dummy.</p>
          <div className="stack">
            <Link className="primary-button" to="/">Back to the lobby <span>↗</span></Link>
            <Link className="text-button" to="/practice">Practice instead →</Link>
          </div>
        </section>
      </main>
    );
  }
  return <OnlineArena session={session} />;
}

function OnlineArena({ session }: { session: Session }) {
  const navigate = useNavigate();
  const [source, setSource] = useState<OnlineDuel | null>(null);
  const [hasMatch, setHasMatch] = useState(false);
  useEffect(() => {
    const duel = new OnlineDuel(session.slot);
    duel.subscribe(() => setHasMatch(true));
    setSource(duel);
    return () => duel.dispose();
  }, [session.slot]);

  const me = session.room.players[session.slot];
  const rival = session.room.players[opponentOf(session.slot)];
  const waitingForRematch = hasMatch && session.room.status !== "in_match" && me?.ready;

  const header = (
    <nav className="duel-nav">
      <span className="duel-mode">ROOM {session.room.code}</span>
      <span className={`presence ${rival?.connected ? "online" : ""}`}>
        {rival ? (rival.connected ? `${playerName[rival.slot]} connected` : `${playerName[rival.slot]} reconnecting…`) : "Waiting for a rival"}
      </span>
      {waitingForRematch && <span className="presence">Rematch requested</span>}
    </nav>
  );

  if (!hasMatch || !source) {
    return (
      <main className="shell secondary-shell arena-ready-shell">
        <section className="calibration arena-ready-panel">
          <p className="eyebrow">ROOM {session.room.code}</p>
          <h1>Take your places</h1>
          <p className="intro">The duel begins with a 3, 2, 1 once both wizards are ready.</p>
          <div className="ready-grid">
            {(["A", "B"] as const).map((slot) => {
              const player = session.room.players[slot];
              return (
                <div key={slot} className={`ready-card player-${slot} ${player?.ready ? "is-ready" : ""}`}>
                  <b>{playerName[slot]}</b>
                  <span>{slot === session.slot ? "You" : player ? (player.connected ? "Rival" : "Reconnecting…") : "Empty seat"}</span>
                  <em>{player?.ready ? "Ready ✓" : "Not ready"}</em>
                </div>
              );
            })}
          </div>
          <button className="primary-button" disabled={!rival} onClick={() => socket.emit("READY_STATUS", !me?.ready)}>
            {me?.ready ? "Not ready yet" : rival ? "I'm ready" : "Waiting for a rival…"} <span>✦</span>
          </button>
        </section>
      </main>
    );
  }

  const leaveRoom = () => {
    socket.emit("LEAVE_ROOM");
    sessionStorage.removeItem(`spellcaster:${session.room.code}`);
    setSession(null);
    navigate("/");
  };

  return <DuelScreen source={source} rematchLabel={waitingForRematch ? "Waiting for rival…" : "Request rematch"} onLeave={leaveRoom} header={header} />;
}
