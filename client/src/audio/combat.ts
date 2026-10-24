import type { GameEvent, MatchState } from "@spellcaster/shared";
import type { DuelSource } from "../game/duelSource";
import type { CueId } from "./cues.ts";
import type { AudioPlayer } from "./player.ts";

type CombatSource = Pick<DuelSource, "state" | "now" | "subscribe">;
type CombatPlayer = Pick<AudioPlayer, "play" | "stopAll">;

/** Only outcomes from the engine/server produce sound; intentions and acks never do. */
export function combatCue(event: GameEvent): CueId | null {
  switch (event.type) {
    case "SPELL_CAST":
      if (event.spell === "fireball") return "cast";
      if (event.spell === "shield") return "shield";
      return null;
    case "SPELL_BLOCKED": return "block";
    case "DAMAGE_APPLIED": return event.amount > 0 ? "hit" : null;
    default: return null;
  }
}

/**
 * One subscription per DuelScreen. Engine IDs increase within a match, so a watermark
 * deduplicates retries with constant memory. A new countdown starts a new ID epoch.
 * Both LocalDuel and OnlineDuel use the same confirmed GameEvent stream.
 */
export function connectCombatAudio(source: CombatSource, player: CombatPlayer) {
  const MAX_AGE_MS = 1_500;
  const FUTURE_TOLERANCE_MS = 250;
  let previous: MatchState | null = source.state();
  let floor = previous?.now ?? -Infinity;
  let watermark = 0;
  let disposed = false;

  const unsubscribe = source.subscribe((state, events) => {
    if (disposed || (previous && state.now < previous.now)) return;
    const freshCountdown = previous && state.phase === "countdown" &&
      (previous.phase !== "countdown" || state.phaseEndsAt !== previous.phaseEndsAt);
    if (freshCountdown) {
      watermark = 0;
      floor = state.now;
      player.stopAll();
    }
    previous = state;
    const now = source.now();
    // Sort a copy: the same batch is also consumed by the renderer and HUD.
    for (const event of [...events].sort((a, b) => a.id - b.id)) {
      if (!Number.isSafeInteger(event.id) || event.id <= watermark) continue;
      // An old event from the preceding match must not poison the new watermark.
      if (!Number.isFinite(event.at) || event.at < floor) continue;
      if (event.at > state.now || event.at > now + FUTURE_TOLERANCE_MS) continue;
      watermark = event.id;
      // Consume stale/muted/disabled events too: enabling audio must never replay them.
      if (now - event.at > MAX_AGE_MS) continue;
      const cue = combatCue(event);
      if (cue) void player.play(cue, { expiresAt: event.at + MAX_AGE_MS, now: () => source.now() });
    }
  });

  return () => {
    if (disposed) return;
    disposed = true;
    unsubscribe();
    player.stopAll();
  };
}
