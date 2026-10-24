import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { drawHands } from "../gesture/drawHand";
import { GestureController } from "../gesture/GestureController";
import type { HandPose, TrackingStatus } from "../gesture/types";
import { useSession } from "../session";

const GESTURE_INFO: { id: string; num: string; name: string; emoji: string; pose: HandPose[] }[] = [
  { id: "fist", num: "01", name: "FIST", emoji: "✊", pose: ["FIST", "BOTH_FISTS"] },
  { id: "palm", num: "02", name: "OPEN PALM", emoji: "✋", pose: ["OPEN_PALM", "BOTH_PALMS"] },
  { id: "victory", num: "03", name: "TWO FINGERS", emoji: "✌️", pose: ["VICTORY"] },
];

export function CalibrationView() {
  const navigate = useNavigate();
  const session = useSession();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<GestureController | null>(null);

  const [status, setStatus] = useState<TrackingStatus>("STARTING");
  const [pose, setPose] = useState<HandPose>("NONE");
  const [error, setError] = useState("");
  const [calibrated, setCalibrated] = useState<Record<string, boolean>>({
    fist: false,
    palm: false,
    victory: false,
  });

  useEffect(() => {
    // Ensure gesture controls stay enabled by default for the duel
    try {
      sessionStorage.setItem("spellcaster:gestures", "on");
    } catch {
      // Ignore private storage limitations
    }

    const controller = new GestureController();
    controllerRef.current = controller;

    const unsubscribers = [
      controller.onObservation((obs) => {
        setStatus(obs.status);
        setPose(obs.pose);

        // Record calibrated gesture when recognized
        for (const item of GESTURE_INFO) {
          if (item.pose.includes(obs.pose)) {
            setCalibrated((prev) => (prev[item.id] ? prev : { ...prev, [item.id]: true }));
          }
        }

        if (obs.status === "ERROR") {
          setError((e) => e || "Camera stopped. Please check permissions and refresh.");
        }
      }),
      controller.onDebugFrame((frame) => {
        if (canvasRef.current) {
          drawHands(canvasRef.current, frame.hands, "#f6c453");
        }
      }),
    ];

    if (videoRef.current) {
      controller.start(videoRef.current).catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
        setStatus("ERROR");
      });
    }

    return () => {
      unsubscribers.forEach((unsub) => unsub());
      controller.stop();
    };
  }, []);

  const live = status === "TRACKING" || status === "NO_HAND";
  const allCalibrated = calibrated.fist && calibrated.palm && calibrated.victory;

  const onEnterArena = () => {
    navigate("/arena");
  };

  const statusMessage =
    status === "STARTING"
      ? "Starting camera…"
      : status === "NO_HAND"
      ? "Hold your hand up to the camera"
      : pose === "FIST" || pose === "BOTH_FISTS"
      ? "Fist detected! ✊"
      : pose === "OPEN_PALM" || pose === "BOTH_PALMS"
      ? "Open palm detected! ✋"
      : pose === "VICTORY"
      ? "Two fingers detected! ✌️"
      : "Hand tracked · Try a gesture below";

  return (
    <main className="shell secondary-shell">
      <header className="topbar">
        <Link to="/" className="brand-link">
          <span className="brand-mark">✦</span> SPELLCASTER
        </Link>
        <span className="step-label">
          {session ? `ROOM ${session.room.code} · ` : ""}01 / CALIBRATION
        </span>
      </header>

      <section className="calibration">
        <p className="eyebrow">BEFORE YOU ENTER</p>
        <h1>Set your spellcraft</h1>
        <p className="intro">
          Make sure your wand hand is visible. Test each gesture below to calibrate your spellcraft.
        </p>

        <div className="camera-frame">
          <video ref={videoRef} className="mirrored calibration-video" autoPlay playsInline muted />
          <canvas ref={canvasRef} className="mirrored calibration-canvas" width={640} height={480} />
          <div className="camera-corners" />

          {!live && (
            <div className="camera-placeholder">
              <span className="camera-icon">◉</span>
              <strong>{status === "STARTING" ? "STARTING CAMERA PREVIEW…" : "CAMERA ACCESS NEEDED"}</strong>
              <span>{error || "Position yourself clearly in frame"}</span>
            </div>
          )}

          {live && (
            <div className={`calibration-badge ${status === "TRACKING" ? "active" : ""}`}>
              <span className="pulse-dot" />
              <span>{statusMessage}</span>
            </div>
          )}
        </div>

        {error && <p className="error-message">{error}</p>}

        <div className="gesture-row">
          {GESTURE_INFO.map((g) => {
            const isDetected = g.pose.includes(pose);
            const isCalibrated = calibrated[g.id];
            return (
              <div
                key={g.id}
                className={`gesture-card ${isDetected ? "detected" : ""} ${isCalibrated ? "calibrated" : ""}`}
              >
                <span>{g.num}</span>
                <strong>{g.name}</strong>
                <i>{g.emoji}</i>
                {isCalibrated && <span className="calibrated-pill">CALIBRATED ✓</span>}
              </div>
            );
          })}
        </div>

        <button
          className={`primary-button ${allCalibrated ? "all-calibrated" : ""}`}
          onClick={onEnterArena}
        >
          Enter the arena <span>↗</span>
        </button>
      </section>
    </main>
  );
}
