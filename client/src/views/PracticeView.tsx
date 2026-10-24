import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { MapPicker, useMapChoice } from "../arena/MapPicker";
import { LocalDuel } from "../game/duelSource";
import { DuelScreen } from "../hud/DuelScreen";

/** Offline duel against the training dummy, or two players on one keyboard. Also the demo fallback. */
export function PracticeView() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const hotseat = params.get("mode") === "hotseat";
  const [source, setSource] = useState<LocalDuel | null>(null);
  const [map, setMap] = useMapChoice();
  useEffect(() => {
    const duel = new LocalDuel(!hotseat);
    setSource(duel);
    return () => duel.dispose();
  }, [hotseat]);

  if (!source) return null;
  return (
    <DuelScreen
      key={hotseat ? "hotseat" : "bot"}
      source={source}
      hotseat={hotseat}
      map={map}
      onLeave={() => navigate("/")}
      header={
        <nav className="duel-nav">
          <span className="duel-mode">PRACTICE</span>
          <MapPicker value={map} onChange={setMap} compact />
          <button className={!hotseat ? "active" : ""} onClick={() => setParams({})}>
            Vs training dummy
          </button>
          <button className={hotseat ? "active" : ""} onClick={() => setParams({ mode: "hotseat" })}>
            Hotseat
          </button>
          <Link to="/">Leave</Link>
        </nav>
      }
    />
  );
}
