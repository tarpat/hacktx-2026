import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { Struggle } from "@spellcaster/shared";
import { LocalDuel, type LocalMode } from "../game/duelSource";
import { DuelScreen } from "../hud/DuelScreen";
import { IntroCutscene, introSeen } from "./IntroCutscene";

const MODES: { mode: LocalMode; label: string }[] = [
  { mode: "training", label: "🎯 Training" },
  { mode: "bot", label: "Vs easy bot" },
];

/** Buttons that start each collision challenge on demand in training. */
const CLASHES: { kind: Struggle["kind"]; label: string }[] = [
  { kind: "pump", label: "⚡ 6–7 clash" },
  { kind: "pose", label: "🐒 Pose race" },
];

const isMode = (value: string | null): value is LocalMode => MODES.some((m) => m.mode === value);
/** Old links to the removed hotseat mode land in training, which now has the same controls. */
const modeFrom = (value: string | null): LocalMode => (value === "hotseat" ? "training" : isMode(value) ? value : "bot");

/**
 * Offline duel against an easy bot, or training: a sturdy rival you can drive yourself from the
 * second key set, with buttons that start each collision challenge. Also the demo fallback.
 */
export function PracticeView() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requested = params.get("mode");
  const mode = modeFrom(requested);
  const [source, setSource] = useState<LocalDuel | null>(null);
  const [showIntro, setShowIntro] = useState(() => !introSeen());
  const endIntro = useCallback(() => setShowIntro(false), []);
  useEffect(() => {
    // The match clock starts when the duel is created, so wait until the story is over.
    if (showIntro) return;
    const duel = new LocalDuel(mode);
    setSource(duel);
    return () => duel.dispose();
  }, [mode, showIntro]);

  if (showIntro) return <IntroCutscene onDone={endIntro} />;
  if (!source) return null;
  return (
    <DuelScreen
      key={mode}
      source={source}
      hotseat={mode === "training"}
      onLeave={() => navigate("/")}
      header={
        <nav className="duel-nav">
          <span className="duel-mode">{mode === "training" ? "TRAINING · YOU CONTROL BOTH WIZARDS" : "PRACTICE"}</span>
          {mode === "training" && CLASHES.map(({ kind, label }) => (
            <button key={kind} onClick={() => source.rehearseClash(kind)}>
              {label}
            </button>
          ))}
          {MODES.map(({ mode: m, label }) => (
            <button key={m} className={mode === m ? "active" : ""} onClick={() => setParams(m === "bot" ? {} : { mode: m })}>
              {label}
            </button>
          ))}
          <Link to="/">Leave</Link>
        </nav>
      }
    />
  );
}
