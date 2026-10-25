import { useEffect, useRef, useState, type ReactNode } from "react";
import { type SpellId, type RacePoseId } from "@spellcaster/shared";
import type { PoseFeedback } from "./racePoseMatcher";
import { startCharge, stopCharge } from "../audio/sound";
import { setFaceSource } from "../game/flair";
import { spellInput } from "../game/input";
import { art, spellGlyph } from "../theme";
import { ChargeOrb, type ActiveCharge, type ChargeOutcome } from "./ChargeOrb";
import { drawHands, drawTraceGuide } from "./drawHand";
import type { CircleChargeFeedback } from "./circleChargeCounter";
import { GestureController } from "./GestureController";
import type { ChargeKind } from "./gestureStateMachine";
import type { GestureAction, HandPose, TrackingStatus } from "./types";

/** Gesture action → engine spell. Charge start/cancel are local feedback only. */
const ACTION_SPELLS: Partial<Record<GestureAction, SpellId>> = {
  FIREBALL_CAST: "fireball",
  SHIELD_CAST: "shield",
  ICE_CAST: "ice",
  TAURUS_CAST: "taurus",
  ULTIMATE_CAST: "ultimate",
};

const POSE_LABELS: Partial<Record<HandPose, string>> = { FIST: "✊", OPEN_PALM: "✋", VICTORY: "✌️", POINT: "☝️", HORNS: "🤘", BOTH_FISTS: "✊✊", BOTH_PALMS: "🙌" };

/** Hand-skeleton glow: gold at rest, the spell's color while charging. */
const HAND_COLOR = { idle: "#f6c453", fireball: "#ff8a4c", ultimate: "#fff27a" };

function SpellIcon({ spell }: { spell: SpellId }) {
  const src = art.spell[spell];
  return src ? <img src={src} alt="" /> : <span>{spellGlyph[spell]}</span>;
}

// Remember gesture camera state for this tab so the camera follows the player from lobby to arena.
// Defaults to true (on).
const STORAGE_KEY = "spellcaster:gestures";
function readEnabled() {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    return saved === null ? true : saved === "on";
  } catch {
    return true;
  }
}
function writeEnabled(on: boolean) {
  try {
    sessionStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    // Storage unavailable (private mode); the toggle just won't persist.
  }
}

/**
 * Floating webcam panel that casts spells for the local wizard through `spellInput`,
 * the same entry point the keyboard fallback uses. Video is processed locally; the only
 * thing that leaves the browser is the knockout snapshot shown on the victory card.
 */
export function GestureCamera({
  ultimateReady = true,
  struggling = false,
  canCast = () => true,
  raceTarget = null,
  onRaceFeedback,
  onCircleChargeFeedback,
  onReady,
  compact = false,
  extraControls,
}: {
  ultimateReady?: boolean;
  struggling?: boolean;
  /** False while the spell is on cooldown or the match isn't live; those gestures are ignored. */
  canCast?: (spell: SpellId) => boolean;
  raceTarget?: RacePoseId | null;
  onRaceFeedback?: (feedback: PoseFeedback) => void;
  onCircleChargeFeedback?: (feedback: CircleChargeFeedback) => void;
  /** Called once the camera is tracking, has failed, or is off: its model load blocks the page while it runs. */
  onReady?: () => void;
  compact?: boolean;
  extraControls?: ReactNode;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<GestureController | null>(null);
  const canCastRef = useRef(canCast);
  canCastRef.current = canCast;
  const [enabled, setEnabled] = useState(readEnabled);
  const [status, setStatus] = useState<TrackingStatus>("CAMERA_OFF");
  const [pose, setPose] = useState<HandPose>("NONE");
  const [charge, setCharge] = useState<ActiveCharge | null>(null);
  const [chargeOutcome, setChargeOutcome] = useState<{ kind: ChargeKind; result: ChargeOutcome } | null>(null);
  const [lastCast, setLastCast] = useState<{ id: number; spell: SpellId } | null>(null);
  const charging = charge !== null;
  const [error, setError] = useState("");
  const [circleComplete, setCircleComplete] = useState(false);
  const raceCallback = useRef(onRaceFeedback);
  raceCallback.current = onRaceFeedback;
  const circleChargeCallback = useRef(onCircleChargeFeedback);
  circleChargeCallback.current = onCircleChargeFeedback;
  const readyCallback = useRef(onReady);
  readyCallback.current = onReady;

  useEffect(() => {
    if (!enabled || error !== "" || status === "ERROR") return readyCallback.current?.();
    if (status !== "TRACKING" && status !== "NO_HAND") return;
    let cancelled = false;
    void controllerRef.current?.whenWarm().then(() => {
      if (!cancelled) readyCallback.current?.();
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, error, status]);

  useEffect(() => {
    const controller = new GestureController();
    controllerRef.current = controller;
    let castId = 0;
    // Mirrors `charge` so the action handler can read the current kind without a stale closure.
    let current: ActiveCharge | null = null;
    let handColor = HAND_COLOR.idle;
    let circleFeedback: CircleChargeFeedback | null = null;
    // A charge started while its spell was unavailable: ignore it until it ends.
    let blocked = false;
    const unsubscribers = [
      controller.onRaceFeedback((feedback) => raceCallback.current?.(feedback)),
      controller.onCircleChargeFeedback((feedback) => { circleFeedback = feedback; setCircleComplete(!!feedback.completed); circleChargeCallback.current?.(feedback); }),
      controller.onObservation((o) => {
        setStatus(o.status);
        setPose(o.pose);
        if (o.status === "ERROR") setError((e) => e || "Camera stopped. Turn the camera off and on to retry.");
      }),
      controller.onAction(({ action, localTimestampMs }) => {
        if (action === "FIREBALL_CHARGE_START" || action === "ULTIMATE_CHARGE_START") {
          const kind: ChargeKind = action === "ULTIMATE_CHARGE_START" ? "ultimate" : "fireball";
          blocked = !canCastRef.current(kind);
          if (blocked) {
            if (current) stopCharge(0.06);
            current = null;
            handColor = HAND_COLOR.idle;
            setCharge(null);
            return;
          }
          // An upgrade keeps the original start time, matching the state machine.
          current = { kind, startedAt: current?.startedAt ?? localTimestampMs };
          setChargeOutcome(null);
          setCharge(current);
          handColor = HAND_COLOR[kind];
          startCharge(kind);
        }
        if (action === "FIREBALL_CAST" || action === "ULTIMATE_CAST" || action === "CHARGE_CANCEL") {
          if (blocked) {
            blocked = false;
            return;
          }
          const kind: ChargeKind = action === "ULTIMATE_CAST" ? "ultimate" : action === "FIREBALL_CAST" ? "fireball" : current?.kind ?? "fireball";
          current = null;
          handColor = HAND_COLOR.idle;
          setCharge(null);
          stopCharge(action === "CHARGE_CANCEL" ? 0.4 : 0.06);
          setChargeOutcome({ kind, result: action === "CHARGE_CANCEL" ? "fizzle" : "cast" });
        }
        if (action === "STRUGGLE_PUSH") return spellInput.push();
        const spell = ACTION_SPELLS[action];
        if (!spell || !canCastRef.current(spell)) return;
        spellInput.cast(spell);
        setLastCast({ id: ++castId, spell });
      }),
      controller.onDebugFrame((frame) => {
        if (!canvasRef.current) return;
        drawHands(canvasRef.current, frame.hands, handColor);
        if (frame.state === "STRUGGLE") drawTraceGuide(canvasRef.current, circleFeedback);
      }),
    ];
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      controller.stop();
      stopCharge();
    };
  }, []);

  useEffect(() => {
    const controller = controllerRef.current;
    const video = videoRef.current;
    if (!controller || !video) return;
    if (!enabled) {
      controller.stop();
      stopCharge();
      setCharge(null);
      setChargeOutcome(null);
      return;
    }
    setError("");
    controller.start(video).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : String(e));
      setEnabled(false);
      writeEnabled(false);
    });
  }, [enabled]);

  // Lend the webcam to the duel for the knockout snapshot on the victory card.
  useEffect(() => {
    setFaceSource(enabled ? videoRef.current : null);
    return () => setFaceSource(null);
  }, [enabled]);

  useEffect(() => {
    controllerRef.current?.setStruggling(struggling);
    setCircleComplete(false);
  }, [struggling]);

  useEffect(() => {
    if (!struggling || raceTarget) return;
    const hint = !enabled ? "Enable your camera to trace the circle."
      : status === "ERROR" ? "Camera stopped · restart it to trace."
      : status === "STARTING" ? "Starting camera…"
      : "Point at the screen and trace the golden circle.";
    // During normal tracking the controller owns progress, including brief dropouts.
    // Do not replace its saved trace with an empty status-change frame.
    if(!enabled || status === "ERROR" || status === "STARTING") circleChargeCallback.current?.({ visible: false, progress: 0, hint });
  }, [struggling, raceTarget, enabled, status]);

  useEffect(() => { controllerRef.current?.setRaceTarget(raceTarget); }, [raceTarget]);

  useEffect(() => {
    if (!raceTarget) return;
    if (!enabled) raceCallback.current?.({ matched: null, hint: "Turn on the camera to match poses" });
    else if (status === "ERROR") raceCallback.current?.({ matched: null, hint: error || "Camera stopped. Turn the camera off and on to retry." });
    else if (status === "STARTING") raceCallback.current?.({ matched: null, hint: "Starting the camera…" });
  }, [enabled, status, raceTarget, error]);

  useEffect(() => {
    if (!chargeOutcome) return;
    // Matches the burst/fizzle animation length.
    const timeout = setTimeout(() => setChargeOutcome(null), 500);
    return () => clearTimeout(timeout);
  }, [chargeOutcome]);

  useEffect(() => {
    if (!lastCast) return;
    const timeout = setTimeout(() => setLastCast(null), 700);
    return () => clearTimeout(timeout);
  }, [lastCast]);

  const toggle = () => {
    writeEnabled(!enabled);
    setEnabled(!enabled);
  };

  const live = status === "TRACKING" || status === "NO_HAND";
  const label =
    status === "STARTING" ? "Starting camera…" : raceTarget ? "Match the reference · face + hands in view" : struggling ? status === "NO_HAND" ? "Show one hand" : "Point and trace the circle" : status === "NO_HAND" ? "Show your hand" : charge?.kind === "ultimate" ? "Charging… drop to strike" : charging ? "Charging… open to cast" : POSE_LABELS[pose] ?? "";

  return (
    <>
    {!compact && <ChargeOrb charge={charge} outcome={chargeOutcome} ultimateReady={ultimateReady} />}
    <aside className={`gesture-cam${compact || raceTarget ? " pose-camera" : ""}${struggling && !raceTarget ? " magic-charge-camera" : ""}${enabled ? " on" : ""}${charge ? ` is-charging charge-${charge.kind}` : ""}`}>
      {struggling && !raceTarget && !compact && !enabled && <div className="magic-charge-camera-placeholder"><span>◯ ✨</span><b>Camera off</b><small>Point your index finger at the screen.</small></div>}
      {(compact || raceTarget) && !enabled && <div className="pose-camera-placeholder"><span>Camera off</span><button className="gesture-cam-toggle" onClick={toggle}>Enable camera</button></div>}
      <div className="gesture-cam-view" hidden={!enabled}>
        <video ref={videoRef} className="mirrored" autoPlay playsInline muted />
        <canvas ref={canvasRef} className="mirrored" width={640} height={480} />
        {!compact && <><i className="gesture-cam-corner tl" /><i className="gesture-cam-corner tr" /><i className="gesture-cam-corner bl" /><i className="gesture-cam-corner br" /></>}
        {live && !compact && <span className="gesture-cam-label">{label}</span>}
        {lastCast && !compact && (
          <span className="gesture-cam-cast" key={lastCast.id}>
            <SpellIcon spell={lastCast.spell} />
          </span>
        )}
      </div>

      {struggling && !raceTarget && !enabled && <button className="gesture-cam-toggle" onClick={toggle}>Enable camera</button>}
      {error && <p className="gesture-cam-error" role="alert">{error}</p>}
      {struggling && !raceTarget && enabled && <button className="gesture-cam-toggle" onClick={() => { controllerRef.current?.resetCircleTracking(); setCircleComplete(false); }}>{circleComplete ? "Try another circle" : "Reset circle tracking"}</button>}
      {compact ? <details className="pose-options">
        <summary>Options</summary>
        <div className="pose-options-panel">
          <button type="button" onClick={toggle}>{enabled ? "Turn camera off" : "Enable camera"}</button>
          {enabled && raceTarget && <button type="button" onClick={() => controllerRef.current?.retryFaceTracking()}>Retry face tracking</button>}
          {extraControls}
        </div>
      </details> : <>
        {raceTarget && enabled && <button className="gesture-cam-toggle" onClick={() => controllerRef.current?.retryFaceTracking()}>Retry face tracking</button>}
      </>}
    </aside>
    </>
  );
}
