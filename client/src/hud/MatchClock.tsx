import type { MatchState } from "@spellcaster/shared";

const END_TEXT = { knockout: "K.O.", time: "TIME", suddenDeath: "K.O.", draw: "DRAW" };

const format = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

/** Round timer: calm, then urgent in the last ten seconds, then sudden death. */
export function MatchClock({ state, now }: { state: MatchState; now: number }) {
  const remaining = state.phaseEndsAt - (state.struggle?.kind === "pose" ? state.struggle.endsAt : now);
  const label =
    state.struggle?.kind === "pose" ? "PAUSED" : state.phase === "countdown" ? "GET READY" : state.phase === "suddenDeath" ? "SUDDEN DEATH" : state.phase === "finished" ? "THE END" : "ROUND";
  const shown = state.phase === "countdown" ? state.roundMs : remaining;
  const urgent = (state.phase === "active" && remaining <= 10_000) || state.phase === "suddenDeath";
  const progress = state.phase === "active" ? Math.max(0, remaining / state.roundMs) : state.phase === "countdown" ? 1 : 0;

  return (
    <div className={`clock ${urgent ? "urgent" : ""} ${state.phase}`}>
      <span className="clock-label">{label}</span>
      <strong className="clock-time" key={urgent ? Math.ceil(remaining / 1000) : "calm"}>
        {state.phase === "finished" && state.endReason ? END_TEXT[state.endReason] : format(shown)}
      </strong>
      <span className="clock-progress">
        <i style={{ transform: `scaleX(${progress})` }} />
      </span>
    </div>
  );
}

/** Big 3-2-1 over the arena while the match is starting. */
export function CountdownOverlay({ state, now }: { state: MatchState; now: number }) {
  if (state.phase !== "countdown") return null;
  const count = Math.max(1, Math.ceil((state.phaseEndsAt - now) / 1000));
  return (
    <div className="countdown" key={count}>
      <span>{count}</span>
    </div>
  );
}
