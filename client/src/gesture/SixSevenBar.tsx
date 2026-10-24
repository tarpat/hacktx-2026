import { DEFAULT_SIX_SEVEN } from "./sixSeven";

/** Speed (swaps/s) that maxes out the speed meter; faster still fills the bar faster. */
const TOP_SPEED = 8;

/**
 * Six Seven charge bar over the local wizard. Appears once the palms-up stance is seen,
 * with a speed meter so players can tell that faster bobbing fills it faster.
 */
export function SixSevenBar({ charge, speed, active }: { charge: number; speed: number; active: boolean }) {
  if (charge <= 0 && !active) return null;
  const { minCastCharge, minSwapsPerSec } = DEFAULT_SIX_SEVEN;
  const ready = charge >= minCastCharge;
  const full = charge >= 1;
  const filling = speed > minSwapsPerSec;
  const flames = speed >= 6 ? "🔥🔥🔥" : speed >= 4 ? "🔥🔥" : filling ? "🔥" : "";
  const hint = full
    ? "MAX POWER! Freeze to unleash!"
    : !filling
      ? "Bob faster to charge!"
      : ready
        ? "Faster = fills faster · freeze to unleash"
        : "Faster! Faster!";
  return (
    <div className={`six-seven${ready ? " ready" : ""}${full ? " full" : ""}`} aria-live="polite">
      <div className="six-seven-head">
        <b>🫴 SIX SEVEN 🫴</b>
        <span>{Math.round(charge * 100)}%</span>
      </div>
      <div className="six-seven-track">
        <i style={{ width: `${charge * 100}%` }} />
        <em style={{ left: `${minCastCharge * 100}%` }} />
      </div>
      <div className="six-seven-speed">
        <span>SPEED</span>
        <div>
          <i className={filling ? "filling" : ""} style={{ width: `${Math.min(1, speed / TOP_SPEED) * 100}%` }} />
          <em style={{ left: `${(minSwapsPerSec / TOP_SPEED) * 100}%` }} />
        </div>
        <span>{flames || "—"}</span>
      </div>
      <p>{hint}</p>
    </div>
  );
}
