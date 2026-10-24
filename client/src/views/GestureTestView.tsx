import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { GestureController, type DebugFrame } from "../gesture/GestureController";
import type { GestureActionEvent, GestureObservation, Landmark } from "../gesture/types";

// Bone pairs for drawing the 21-point hand skeleton.
const BONES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

function drawHand(canvas: HTMLCanvasElement, landmarks: Landmark[] | null) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  if (!landmarks) return;
  ctx.strokeStyle = "#d9bd75";
  ctx.lineWidth = 3;
  for (const [a, b] of BONES) {
    ctx.beginPath();
    ctx.moveTo(landmarks[a].x * width, landmarks[a].y * height);
    ctx.lineTo(landmarks[b].x * width, landmarks[b].y * height);
    ctx.stroke();
  }
  ctx.fillStyle = "#f4efe5";
  for (const point of landmarks) {
    ctx.beginPath();
    ctx.arc(point.x * width, point.y * height, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function GestureTestView() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<GestureController | null>(null);
  const [observation, setObservation] = useState<GestureObservation | null>(null);
  const [debug, setDebug] = useState<Pick<DebugFrame, "fps" | "state">>({ fps: 0, state: "IDLE" });
  const [log, setLog] = useState<(GestureActionEvent & { id: number })[]>([]);
  const [shieldUp, setShieldUp] = useState(false);
  const [charging, setCharging] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new GestureController();
    controllerRef.current = controller;
    let nextId = 0;
    const unsubscribers = [
      controller.onObservation((o) => {
        setObservation(o);
        if (o.status === "ERROR") setError((e) => e || "The camera stopped. Reconnect it and press Start.");
      }),
      controller.onAction((event) => {
        setLog((entries) => [{ ...event, id: nextId++ }, ...entries].slice(0, 10));
        if (event.action === "SHIELD_START") setShieldUp(true);
        if (event.action === "SHIELD_END") setShieldUp(false);
        if (event.action === "FIREBALL_CHARGE_START") setCharging(true);
        if (event.action === "FIREBALL_CAST" || event.action === "FIREBALL_CHARGE_CANCEL") setCharging(false);
      }),
      controller.onDebugFrame((frame) => {
        if (canvasRef.current) drawHand(canvasRef.current, frame.landmarks);
        setDebug((d) => (d.fps === frame.fps && d.state === frame.state ? d : { fps: frame.fps, state: frame.state }));
      }),
    ];
    // Cleanup stops camera tracks, including on React Strict Mode's dev remount.
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      controller.stop();
    };
  }, []);

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
      <dl className="gesture-stats">
        <div><dt>STATUS</dt><dd>{status}</dd></div>
        <div><dt>POSE</dt><dd>{observation?.pose ?? "NONE"}</dd></div>
        <div><dt>RAW</dt><dd>{observation?.rawPose ?? "NONE"}</dd></div>
        <div><dt>STATE</dt><dd>{debug.state}</dd></div>
        <div><dt>HAND</dt><dd>{observation?.hand ?? "—"}</dd></div>
        <div><dt>FPS</dt><dd>{live ? debug.fps : "—"}</dd></div>
      </dl>
      <p className="gesture-hint">✊ hold fist to charge → ✋ open to cast fireball · ✋ hold open palm (no charge) for shield</p>
      <ol className="gesture-log">
        {log.length === 0 && <li className="empty">No actions yet</li>}
        {log.map((entry) => <li key={entry.id}><span>{(entry.localTimestampMs / 1000).toFixed(2)}s</span>{entry.action}</li>)}
      </ol>
    </section>
  </main>;
}
