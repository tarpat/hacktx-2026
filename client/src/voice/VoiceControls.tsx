import { useEffect, useState, useSyncExternalStore } from "react";
import type { DuelSource } from "../game/duelSource";
import { spellInput } from "../game/input";
import { VoiceCaster } from "./recognition";
import "./voice.css";

function Controls({ caster }: { caster: VoiceCaster }) {
  const state = useSyncExternalStore(caster.subscribe, caster.getSnapshot);
  const [allowService, setAllowService] = useState(false);
  const listening = state.status !== "idle";
  return <details className="voice-controls" onToggle={(event) => { if (!event.currentTarget.open) caster.stop(); }}>
    <summary>Voice casting</summary>
    <div className="voice-body" role="group" aria-label="Voice casting">
      <p>Say fireball / Incendio, shield / Protego, ice / Glacius, or ultimate / Fulmen. One phrase requests one spell for your wizard.</p>
      <label><input type="checkbox" checked={allowService} onChange={(event) => { caster.stop(); setAllowService(event.target.checked); }} />Use browser speech service</label>
      <p className="voice-privacy">Off by default. On-device recognition requires browser support and an English language pack. If you enable the browser speech service, your browser may send microphone audio to its provider. The game does not record audio or store transcripts.</p>
      <button disabled={!state.supported} onClick={() => listening ? caster.stop() : caster.start(allowService)}>{listening ? "Stop listening" : "Speak a spell"}</button>
      <span role="status" aria-label="Voice input status">{state.message}</span>
      {state.transcript && <p className="voice-transcript">{state.interim ? "Hearing" : "Heard"}: <output aria-label="Recognized speech">{state.transcript}</output></p>}
    </div>
  </details>;
}

export function VoiceControls({ source }: { source: DuelSource }) {
  const [caster, setCaster] = useState<VoiceCaster | null>(null);
  useEffect(() => {
    const instance = new VoiceCaster({
      onCast: (spell) => spellInput.cast(spell, source.localSlot),
      isActive: () => { const phase = source.state()?.phase; return phase === "active" || phase === "suddenDeath"; },
    });
    const unsubscribe = source.subscribe((state) => {
      if (state.phase === "countdown" || state.phase === "finished") instance.stop();
    });
    const onVisibility = () => { if (document.hidden) instance.stop(); };
    document.addEventListener("visibilitychange", onVisibility);
    setCaster(instance);
    return () => { unsubscribe(); document.removeEventListener("visibilitychange", onVisibility); instance.dispose(); };
  }, [source]);
  return caster ? <Controls caster={caster} /> : null;
}
