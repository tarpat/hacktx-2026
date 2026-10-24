import { useEffect, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { AudioPlayer } from "./player";
import { cues, type CueId } from "./cues";
import "./playground.css";

function Controls({ player }: { player: AudioPlayer }) {
  const state = useSyncExternalStore(player.subscribe, player.getSnapshot);
  const [message, setMessage] = useState("Enable audio, then choose a sound.");
  const [loading, setLoading] = useState(false);

  async function enable() {
    setLoading(true);
    const enabled = await player.enable();
    const loaded = enabled && await player.preload();
    setLoading(false);
    setMessage(loaded ? "All six sounds are ready." : "Audio needs attention. You can retry.");
  }

  async function play(id: CueId) {
    const result = await player.play(id);
    setMessage(`${cues[id].label}: ${result}.`);
  }

  return <>
    <div className="audio-toolbar">
      <button className="primary-button" onClick={() => void enable()} disabled={loading}>{loading ? "Loading sounds…" : "Enable audio"}</button>
      <button className="audio-button" aria-pressed={state.muted} onClick={() => player.setMuted(!state.muted)}>{state.muted ? "Unmute" : "Mute"}</button>
      <button className="audio-button" onClick={() => { player.stopAll(); setMessage("All sounds stopped."); }}>Stop all</button>
    </div>
    <label className="audio-volume">Master volume <input type="range" min="0" max="100" value={Math.round(state.volume * 100)} onChange={(event) => player.setVolume(Number(event.target.value) / 100)} /><span>{Math.round(state.volume * 100)}%</span></label>
    <p className="audio-status" role="status">{message} Active sounds: {state.activeVoices}/8.</p>
    {state.error && <p className="error-message" role="alert">{state.error}</p>}
    <div className="audio-cues">{(Object.keys(cues) as CueId[]).map((id, index) => <button className="audio-cue" key={id} disabled={!state.enabled} onClick={() => void play(id)}><span>0{index + 1}</span><strong>{cues[id].label}</strong><small>Play sound ↗</small></button>)}</div>
    <button className="audio-button" disabled={!state.enabled} onClick={() => { void Promise.all(Array.from({ length: 12 }, () => player.play("cast"))).then((results) => setMessage(`Overlap test: ${results.filter((result) => result === "played").length} played; ${results.filter((result) => result === "limited").length} limited.`)); }}>Test overlapping casts</button>
  </>;
}

export function AudioPlayground() {
  const [player, setPlayer] = useState<AudioPlayer | null>(null);
  useEffect(() => {
    const instance = new AudioPlayer({ baseUrl: `${import.meta.env.BASE_URL}audio/` });
    setPlayer(instance);
    return () => instance.dispose();
  }, []);

  return <main className="shell audio-shell">
    <header className="topbar"><Link className="brand-link" to="/">✦ SPELLCASTER</Link><span className="step-label">SOUND CHECK</span></header>
    <section className="audio-panel"><p className="eyebrow">THE SOUND OF SPELLCRAFT</p><h1>Audio playground</h1><p className="audio-intro">Try the duel’s first six sounds. No room, camera, or microphone needed. These original placeholder effects will be refined during combat integration.</p>
      {player && <Controls player={player} />}
      <p className="audio-note">Use a comfortable speaker volume. Leaving this page stops playback. These controls do not affect the arena yet.</p>
    </section>
  </main>;
}
