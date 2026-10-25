import { useEffect, useState } from "react";
import { DEFAULT_TIMINGS, type ChargeKind } from "./gestureStateMachine";

/** Final stretch before the charge auto-cancels. */
const WARNING_MS = 600;

export interface ActiveCharge {
  kind: ChargeKind;
  startedAt: number;
}

interface ChargeOrbProps {
  charge: ActiveCharge | null;
  /** False when Fulmen's meter isn't full, so the player knows the cast will be refused. */
  ultimateReady: boolean;
}

/**
 * Charge prompt over the local wizard: says when it's ready to release and warns
 * before it times out. The arena draws the casting circle itself.
 */
export function ChargeOrb({ charge, ultimateReady }: ChargeOrbProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!charge) return;
    let frame = requestAnimationFrame(function tick() {
      setElapsed(performance.now() - charge.startedAt);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [charge]);

  if (!charge) return null;

  const { minMs, maxMs } = DEFAULT_TIMINGS.charge[charge.kind];
  const left = maxMs - elapsed;
  const phase = elapsed < minMs ? "building" : left > WARNING_MS ? "ready" : "warning";
  const ultimate = charge.kind === "ultimate";
  const action = ultimate ? "Drop it to strike!" : "Open your hand!";
  const text =
    ultimate && !ultimateReady ? "Fulmen meter not full!" : phase === "building" ? (ultimate ? "⚡ Fulmen charging…" : "Charging…") : phase === "ready" ? action : "Release now!";

  return (
    <div className={`charge-orb ${charge.kind} ${phase}${ultimate && !ultimateReady ? " blocked" : ""}`} aria-live="polite">
      <b className="charge-text">{text}</b>
    </div>
  );
}
