import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { GestureController, type DebugFrame } from "../gesture/GestureController";
import { SpellPreview } from "./SpellPreview";
import { drawForearms, drawHands } from "../gesture/drawHand";
import type { SixSevenFeedback } from "../gesture/sixSevenCounter";
import type { GestureActionEvent, GestureObservation } from "../gesture/types";

export function GestureTestView() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<GestureController | null>(null);
  const [observation, setObservation] = useState<GestureObservation | null>(null);
  const [debug, setDebug] = useState<Pick<DebugFrame, "fps" | "state"> & { handCount: number }>({ fps: 0, state: "IDLE", handCount: 0 });
  const [log, setLog] = useState<(GestureActionEvent & { id: number })[]>([]);
  const [shieldUp, setShieldUp] = useState(false);
  const [charging, setCharging] = useState(false);
  const [error, setError] = useState("");
  const [sixSevenMode, setSixSevenMode] = useState(false);
  const [beats, setBeats] = useState(0);
  const [sixSevenFeedback, setSixSevenFeedback] = useState<SixSevenFeedback | null>(null);

  useEffect(() => {
    const controller = new GestureController();
    controllerRef.current = controller;
    let nextId = 0;
    let shieldTimer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribers = [
      controller.onSixSevenFeedback(setSixSevenFeedback),
      controller.onObservation((o) => {
        setObservation(o);
        if (o.status === "ERROR") setError((e) => e || "The camera stopped. Reconnect it and press Start.");
      }),
      controller.onAction((event) => {
        if (event.action === "STRUGGLE_PUSH") setBeats((count) => count + 1);
        setLog((entries) => [{ ...event, id: nextId++ }, ...entries].slice(0, 10));
        if (event.action === "SHIELD_CAST") {
          // Mirrors the engine's 900 ms guard window.
          setShieldUp(true);
          clearTimeout(shieldTimer);
          shieldTimer = setTimeout(() => setShieldUp(false), 900);
        }
        if (event.action === "FIREBALL_CHARGE_START") setCharging(true);
        if (event.action === "FIREBALL_CAST" || event.action === "CHARGE_CANCEL") setCharging(false);
      }),
      controller.onDebugFrame((frame) => {
        if (canvasRef.current) {
          if (frame.body) drawForearms(canvasRef.current, frame.body);
          else drawHands(canvasRef.current, frame.hands);
        }
        setDebug((d) => (d.fps === frame.fps && d.state === frame.state && d.handCount === frame.hands.length
          ? d : { fps: frame.fps, state: frame.state, handCount: frame.hands.length }));
      }),
    ];
    // Cleanup stops camera tracks, including on React Strict Mode's dev remount.
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      clearTimeout(shieldTimer);
      controller.stop();
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.setStruggling(sixSevenMode);
    setBeats(0);
    setSixSevenFeedback(null);
  }, [sixSevenMode]);

  const start = async () => {
    if (!videoRef.current || !controllerRef.current) return;
    setError("");
    try {
      await controllerRef.current.start(videoRef.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const stop = () => {
    controllerRef.current?.stop();
    canvasRef.current?.getContext("2d")?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  };

  const status = observation?.status ?? "CAMERA_OFF";
  const live = status === "TRACKING" || status === "NO_HAND";

  return <main className="shell secondary-shell">
    <header className="topbar"><Link to="/" className="brand-link"><span className="brand-mark">✦</span> SPELLCASTER</Link><span className="step-label">DEV / GESTURE TEST</span></header>
    <section className="gesture-test">
      <p className="eyebrow">LOCAL ONLY · NO FRAMES LEAVE THIS BROWSER</p>
      <h1>Gesture test</h1>
      <label className="six-seven-test-toggle"><input type="checkbox" checked={sixSevenMode} onChange={(event) => setSixSevenMode(event.target.checked)} /> Test the 6–7 collision gesture</label>
      <div className={`camera-frame gesture-camera${shieldUp ? " is-shield" : ""}${charging ? " is-charging" : ""}`}>
        <video ref={videoRef} className="mirrored" autoPlay playsInline muted />
        <canvas ref={canvasRef} className="mirrored" width={640} height={480} />
        {!live && <div className="camera-placeholder"><span className="camera-icon">◉</span><strong>{status === "STARTING" ? "STARTING CAMERA…" : "CAMERA OFF"}</strong></div>}
      </div>
      <div className="gesture-controls">
        <button className="primary-button" onClick={start} disabled={status === "STARTING" || live}>Start camera <span>◉</span></button>
        <button className="secondary-button" onClick={stop} disabled={status === "CAMERA_OFF"}>Stop</button>
      </div>
      {error && <p className="error-message">{error}</p>}
      {sixSevenMode ? <div className="six-seven-test-feedback">
        <strong>{beats} {beats === 1 ? "beat" : "beats"}</strong>
        <p role="status">{sixSevenFeedback?.hint ?? "Start the camera and keep both elbows and wrists in view."}</p>
        <button className="secondary-button" onClick={() => { controllerRef.current?.retryBodyTracking(); setBeats(0); }}>Reset / retry 6–7 tracking</button>
      </div> : <SpellPreview lastAction={log[0] ?? null} />}
      <dl className="gesture-stats">
        <div><dt>STATUS</dt><dd>{status}</dd></div>
        <div><dt>POSE</dt><dd>{observation?.pose ?? "NONE"}</dd></div>
        <div><dt>RAW</dt><dd>{observation?.rawPose ?? "NONE"}</dd></div>
        <div><dt>STATE</dt><dd>{debug.state}</dd></div>
        <div><dt>HAND</dt><dd>{observation?.hand ?? "—"}</dd></div>
        <div><dt>HANDS TRACKED</dt><dd>{live ? debug.handCount : 0} / 2</dd></div>
        <div><dt>FPS</dt><dd>{live ? debug.fps : "—"}</dd></div>
      </dl>
      <p className="gesture-hint">{sixSevenMode ? "Palms up. Rock your forearms up and down. Each wrist lift above its elbow scores one beat." : "✊ hold → ✋ open: fireball · 🙌 both palms: shield · ✌️ peace: ice · 🤘 hook 'em: taurus · ☝️ point up, then drop: ultimate"}</p>
      <ol className="gesture-log">
        {log.length === 0 && <li className="empty">No actions yet</li>}
        {log.map((entry) => <li key={entry.id}><span>{(entry.localTimestampMs / 1000).toFixed(2)}s</span>{entry.action}</li>)}
      </ol>
    </section>
  </main>;
}
