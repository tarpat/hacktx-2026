import { useEffect, useState } from "react";
import { DEFAULT_TIMINGS, type ChargeKind } from "./gestureStateMachine";

/** Final stretch before the charge auto-cancels. */
const WARNING_MS = 600;

export type ChargeOutcome = "cast" | "fizzle";

export interface ActiveCharge {
  kind: ChargeKind;
  startedAt: number;
}

interface ChargeOrbProps {
  charge: ActiveCharge | null;
  outcome: { kind: ChargeKind; result: ChargeOutcome } | null;
  /** False when Fulmen's meter isn't full, so the player knows the cast will be refused. */
  ultimateReady: boolean;
}

/**
 * Charge feedback over the local wizard: builds up, says when it's ready to
 * release, warns before it times out, then bursts or fizzles.
 * Fireball and Fulmen share the flow but look different.
 */
export function ChargeOrb({ charge, outcome, ultimateReady }: ChargeOrbProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!charge) return;
    let frame = requestAnimationFrame(function tick() {
      setElapsed(performance.now() - charge.startedAt);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [charge]);

  if (!charge) {
    if (!outcome) return null;
    return (
      <div className={`charge-orb ${outcome.kind} ${outcome.result}`} aria-hidden>
        <span className="charge-core" />
      </div>
    );
  }

  const { minMs, maxMs } = DEFAULT_TIMINGS.charge[charge.kind];
  const left = maxMs - elapsed;
  const phase = elapsed < minMs ? "building" : left > WARNING_MS ? "ready" : "warning";
  // Ring fills while building, then drains to show how long the charge can be held.
  const ring = phase === "building" ? elapsed / minMs : Math.max(0, left / (maxMs - minMs));
  const scale = 0.5 + 0.7 * Math.min(1, elapsed / maxMs);
  const ultimate = charge.kind === "ultimate";
  const action = ultimate ? "Drop it to strike!" : "Open your hand!";
  const text =
    ultimate && !ultimateReady ? "Fulmen meter not full!" : phase === "building" ? (ultimate ? "⚡ Fulmen charging…" : "Charging…") : phase === "ready" ? action : "Release now!";

  return (
    <div className={`charge-orb ${charge.kind} ${phase}${ultimate && !ultimateReady ? " blocked" : ""}`} aria-live="polite">
      <span className="charge-ring" style={{ "--ring": `${ring * 360}deg` } as React.CSSProperties} />
      <span className="charge-core" style={{ transform: `scale(${scale})` }} />
      <b className="charge-text">{text}</b>
    </div>
  );
}
