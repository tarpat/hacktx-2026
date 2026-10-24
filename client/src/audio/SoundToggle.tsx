import { useEffect, useState } from "react";
import { isMuted, onMuteChange, setMuted } from "./sound";

/** Floating mute button, shown on every screen. */
export function SoundToggle() {
  const [muted, setLocal] = useState(isMuted);
  useEffect(() => onMuteChange(setLocal), []);
  return (
    <button className="sound-toggle" aria-label={muted ? "Unmute sound" : "Mute sound"} title={muted ? "Unmute" : "Mute"} onClick={() => setMuted(!muted)}>
      {muted ? "🔇" : "🎵"}
    </button>
  );
}
