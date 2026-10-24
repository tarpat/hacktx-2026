import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { MapPicker, useMapChoice } from "../arena/MapPicker";
import { LocalDuel, type LocalMode } from "../game/duelSource";
import { Spellbook } from "../gesture/Spellbook";
import { DuelScreen } from "../hud/DuelScreen";

const MODES: { mode: LocalMode; label: string }[] = [
  { mode: "training", label: "🎯 Training dummy" },
  { mode: "bot", label: "Vs easy bot" },
  { mode: "hotseat", label: "Hotseat" },
];

const isMode = (value: string | null): value is LocalMode => MODES.some((m) => m.mode === value);

/** Offline duel: a passive training dummy, an easy bot, or two players on one keyboard. Also the demo fallback. */
export function PracticeView() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requested = params.get("mode");
  const mode: LocalMode = isMode(requested) ? requested : "bot";
  const [source, setSource] = useState<LocalDuel | null>(null);
  const [map, setMap] = useMapChoice();
  useEffect(() => {
    const duel = new LocalDuel(mode);
    setSource(duel);
    return () => duel.dispose();
  }, [mode]);

  if (!source) return null;
  return (
    <DuelScreen
      key={mode}
      source={source}
      hotseat={mode === "hotseat"}
      map={map}
      onLeave={() => navigate("/")}
      header={
        <nav className="duel-nav">
          <span className="duel-mode">{mode === "training" ? "TRAINING · DUMMY WON'T FIGHT BACK" : "PRACTICE"}</span>
          <MapPicker value={map} onChange={setMap} compact />
          {MODES.map(({ mode: m, label }) => (
            <button key={m} className={mode === m ? "active" : ""} onClick={() => setParams(m === "bot" ? {} : { mode: m })}>
              {label}
            </button>
          ))}
          <Link to="/">Leave</Link>
        </nav>
      }
      footer={mode !== "hotseat" && <Spellbook />}
    />
  );
}
