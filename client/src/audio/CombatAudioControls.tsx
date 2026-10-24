import { useEffect, useState, useSyncExternalStore } from "react";
import type { DuelSource } from "../game/duelSource";
import { connectCombatAudio } from "./combat";
import { AudioPlayer } from "./player";
import "./combat.css";

function Controls({ player }: { player: AudioPlayer }) {
  const state = useSyncExternalStore(player.subscribe, player.getSnapshot);
  const [loading, setLoading] = useState(false);

  async function enable() {
    setLoading(true);
    if (await player.enable()) await player.preload();
    setLoading(false);
  }

  return <div className="combat-audio" role="group" aria-label="Duel audio">
    <button onClick={() => void enable()} disabled={loading || (state.enabled && !state.error)}>{loading ? "Loading sound…" : state.enabled ? state.error ? "Retry sound" : "Sound enabled" : "Enable duel audio"}</button>
    <button onClick={() => player.setMuted(!state.muted)} disabled={!state.enabled} aria-pressed={state.muted}>{state.muted ? "Unmute duel" : "Mute duel"}</button>
    <label>Sound volume<input aria-label="Duel sound volume" type="range" min="0" max="100" value={Math.round(state.volume * 100)} onChange={(event) => player.setVolume(Number(event.target.value) / 100)} /></label>
    <span role="status">{!state.enabled ? "Sound off" : state.muted || state.volume === 0 ? "Sound muted" : "Sound on"}</span>
    {state.error && <span role="alert">{state.error}</span>}
  </div>;
}

/** Lifetime follows the source, so switching practice mode or leaving also stops audio. */
export function CombatAudioControls({ source }: { source: DuelSource }) {
  const [player, setPlayer] = useState<AudioPlayer | null>(null);
  useEffect(() => {
    const instance = new AudioPlayer({ baseUrl: `${import.meta.env.BASE_URL}audio/` });
    const disconnect = connectCombatAudio(source, instance);
    setPlayer(instance);
    return () => { disconnect(); instance.dispose(); };
  }, [source]);
  return player ? <Controls player={player} /> : null;
}
