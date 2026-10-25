import { useEffect, useRef, useState } from "react";
import { POSE_RACE, POSE_SEQUENCE, opponentOf, type PlayerSlot, type Struggle } from "@spellcaster/shared";
import type { DuelSource } from "../game/duelSource";
import { GestureCamera } from "../gesture/GestureCamera";
import type { PoseFeedback } from "../gesture/racePoseMatcher";
import { playerName } from "../theme";

export function PoseRace({ struggle, source, now, hotseat }: { struggle: Extract<Struggle, { kind: "pose" }>; source: DuelSource; now: number; hotseat: boolean }) {
  const [assist, setAssist] = useState(false);
  const [cameraSlot, setCameraSlot] = useState(source.localSlot);
  const [feedback, setFeedback] = useState<PoseFeedback>({ matched: null, hint: "Turn on the camera and keep your face and hands in view" });
  const held = useRef<Record<PlayerSlot, boolean>>({ A: false, B: false });
  const latest = useRef(struggle);
  latest.current = struggle;
  const race = struggle.poseRace;
  const local = race.progress[cameraSlot];
  const target = POSE_SEQUENCE[local.step];
  const countdown = now < race.readyAt;
  const seconds = Math.max(0, ((countdown ? race.readyAt : struggle.endsAt) - now) / 1000);
  const fresh = now - local.lastSampleAt <= POSE_RACE.sampleGapMs;
  const hold = fresh && local.holdSince !== null ? Math.min(1, (now - local.holdSince) / POSE_RACE.holdMs) : 0;
  const other = opponentOf(source.localSlot);
  // A raw camera match cannot count until the server sees a release. Do not tell
  // players to keep holding a pose that they first need to relax out of.
  const hint = !assist && !countdown && !local.released && feedback.matched === true
    ? target?.id === "grin" ? "Lower your hand briefly, then raise one finger and smile again." : "Relax out of the pose briefly, then copy the reference again."
    : feedback.hint;

  useEffect(() => {
    setFeedback({ matched: null, hint: "Turn on the camera, then relax briefly before matching the image" });
  }, [local.step, cameraSlot]);

  useEffect(() => {
    if (!assist) return;
    const slots = hotseat ? [source.localSlot, opponentOf(source.localSlot)] : [source.localSlot];
    const setKey = (event: KeyboardEvent, down: boolean) => {
      const slot = event.code === "Space" ? source.localSlot : hotseat && event.code === "Enter" ? opponentOf(source.localSlot) : null;
      if (slot) { event.preventDefault(); held.current[slot] = down; }
    };
    const down = (event: KeyboardEvent) => setKey(event, true);
    const up = (event: KeyboardEvent) => setKey(event, false);
    const clear = () => { held.current = { A: false, B: false }; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    const timer = setInterval(() => {
      const current = latest.current.poseRace;
      for (const slot of slots) source.poseSample({ struggleId: current.id, step: current.progress[slot].step, matched: document.hidden ? null : held.current[slot] }, slot);
    }, POSE_RACE.sampleIntervalMs);
    return () => { clearInterval(timer); clear(); window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", clear); };
  }, [assist, hotseat, source]);

  const observe = (next: PoseFeedback) => {
    setFeedback(next);
    const current = latest.current.poseRace;
    source.poseSample({ struggleId: current.id, step: current.progress[cameraSlot].step, matched: next.matched }, cameraSlot);
  };

  return (
    <section className="pose-race" aria-label="Pose race">
      <header className="pose-race-header">
        <div><span className="pose-eyebrow">COLLISION EVENT · COMBAT PAUSED</span><h2>Monkey see. Wizard do.</h2></div>
        <strong className="pose-clock" role="timer" aria-label={countdown ? "Get ready" : "Race time remaining"}>{countdown ? `Ready in ${Math.ceil(seconds)}` : `${seconds.toFixed(1)}s`}</strong>
      </header>
      <p className="pose-rules">First to match all {POSE_SEQUENCE.length} images wins both spells. Hold each for 0.45s; relax between poses.</p>
      <div className="pose-scoreboard">
        {[source.localSlot, other].map((slot) => <div key={slot} className={`pose-score player-${slot}`}>
          <b>{hotseat ? playerName[slot] : slot === source.localSlot ? "YOU" : "RIVAL"} <span>{race.progress[slot].step}/{POSE_SEQUENCE.length}</span></b>
          <div className="pose-steps" aria-label={`${playerName[slot]}: ${race.progress[slot].step} of ${POSE_SEQUENCE.length} poses`}>
            {POSE_SEQUENCE.map((pose, i) => <span key={pose.id} className={i < race.progress[slot].step ? "done" : i === race.progress[slot].step ? "current" : ""}>{i < race.progress[slot].step ? "✓" : i + 1}</span>)}
          </div>
        </div>)}
      </div>
      <div className="pose-comparison">
        <figure className="pose-reference" key={target?.id}>
          <img src={target?.image} alt={target?.cue} />
          <figcaption><span>POSE {local.step + 1} OF {POSE_SEQUENCE.length}</span><h3>{target?.name}</h3><p>{target?.cue}</p></figcaption>
        </figure>
        <div className="pose-live">
          {hotseat && !assist && <label className="pose-camera-picker">Camera scores <select value={cameraSlot} onChange={(e) => setCameraSlot(e.target.value as PlayerSlot)}><option value="A">{playerName.A}</option><option value="B">{playerName.B}</option></select></label>}
          <GestureCamera struggling raceTarget={assist ? null : target?.id ?? null} onRaceFeedback={observe} />
          <div className={`pose-feedback${hold > 0 ? " matching" : ""}`} role="status">
            <strong>{countdown ? "Get ready — relax first" : assist ? "Practice assist: hold, release, repeat" : feedback.matched === null ? "Camera needed" : !local.released ? "Relax briefly before matching" : feedback.matched ? "Hold that pose!" : "Match the reference"}</strong>
            <p>{assist ? "Release for a moment before each new hold." : hint}</p>
            <div className="pose-hold" role="progressbar" aria-label="Pose hold" aria-valuenow={Math.round(hold * 100)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${hold * 100}%` }} /></div>
          </div>
        </div>
      </div>
      <ol className="pose-filmstrip" aria-label="All required poses">{POSE_SEQUENCE.map((pose, i) => <li key={pose.id} className={i < local.step ? "done" : i === local.step ? "current" : ""}><img src={pose.image} alt="" /><span>{i + 1}. {pose.name}</span></li>)}</ol>
      <footer className="pose-race-footer"><small>Mirrored camera · either hand works · video stays on your device. No finisher = draw.</small>
        {source.poseAssist && <label className="pose-assist"><input type="checkbox" checked={assist} onChange={(e) => setAssist(e.target.checked)} /> Keyboard practice assist</label>}
        {assist && <div className="pose-assist-buttons">{(hotseat ? [source.localSlot, other] : [source.localSlot]).map((slot) => <button key={slot} onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); held.current[slot] = true; }} onPointerUp={() => { held.current[slot] = false; }} onPointerCancel={() => { held.current[slot] = false; }}>{hotseat ? playerName[slot] : "You"}: hold {slot === source.localSlot ? "SPACE" : "ENTER"} or hold here</button>)}</div>}
      </footer>
    </section>
  );
}
