import { useEffect, useState, useSyncExternalStore } from "react";
import type { DuelSource } from "../game/duelSource";
import { spellInput } from "../game/input";
import { VoiceCaster, type ProcessingMode } from "./recognition";
import "./voice.css";

function Controls({ caster }: { caster: VoiceCaster }) {
  const state = useSyncExternalStore(caster.subscribe, caster.getSnapshot);
  return <section className="voice-controls" role="group" aria-label="Voice casting">
    <div className="voice-body">
      <strong>Voice casting</strong>
      <button disabled={!state.supported} onClick={() => state.enabled ? caster.stop() : void caster.start()}>{state.enabled ? "Stop voice" : "Resume voice"}</button>
      <span role="status" aria-label="Voice input status">{state.message}</span>
      <p>Say <b>incendio</b>, <b>protego</b>, <b>glacius</b>, or <b>fulmen</b>. Commands send as soon as they are recognized; keep speaking to cast again.</p>
      {state.transcript && <p className="voice-transcript">{state.interim ? "Hearing" : "Heard"}: <output aria-label="Recognized speech">{state.transcript}</output></p>}
      <details className="voice-settings"><summary>Speech settings</summary><label>Processing
        <select aria-label="Speech processing" value={state.mode} onChange={(event) => caster.setProcessingMode(event.target.value as ProcessingMode)}><option value="auto">Automatic</option><option value="local">On-device only</option><option value="browser">Browser service</option></select>
      </label></details>
      <p className="voice-privacy">Voice starts automatically in the duel. Automatic mode uses an installed on-device model when available, otherwise your browser's speech service may process microphone audio. The game does not record audio or store transcripts. Stop voice pauses the microphone.</p>
    </div>
  </section>;
}

export function VoiceControls({ source }: { source: DuelSource }) {
  const [caster, setCaster] = useState<VoiceCaster | null>(null);
  useEffect(() => {
    const instance = new VoiceCaster({
      onCast: (spell) => spellInput.cast(spell, source.localSlot),
      isActive: () => { const phase = source.state()?.phase; return phase === "active" || phase === "suddenDeath"; },
    });
    const sync = () => {
      if (document.hidden || source.state()?.phase === "finished") instance.pause();
      else instance.resume();
    };
    const unsubscribe = source.subscribe(sync);
    document.addEventListener("visibilitychange", sync);
    sync();
    void instance.start(); // Warm the recognizer during countdown, before the first attack.
    setCaster(instance);
    return () => { unsubscribe(); document.removeEventListener("visibilitychange", sync); instance.dispose(); };
  }, [source]);
  return caster ? <Controls caster={caster} /> : null;
}
