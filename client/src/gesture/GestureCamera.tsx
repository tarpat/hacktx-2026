import { useEffect, useRef, useState } from "react";
import type { SpellId, RacePoseId } from "@spellcaster/shared";
import type { PoseFeedback } from "./racePoseMatcher";
import { startCharge, stopCharge } from "../audio/sound";
import { spellInput } from "../game/input";
import { art, spellGlyph } from "../theme";
import { ChargeOrb, type ActiveCharge, type ChargeOutcome } from "./ChargeOrb";
import { drawHands } from "./drawHand";
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

const LEGEND: { spell: SpellId; pose: string; poses: HandPose[] }[] = [
  { spell: "fireball", pose: "✊→✋", poses: ["FIST", "BOTH_FISTS"] },
  { spell: "shield", pose: "🙌", poses: ["BOTH_PALMS"] },
  { spell: "ice", pose: "✌️", poses: ["VICTORY"] },
  { spell: "taurus", pose: "🤘", poses: ["HORNS"] },
  { spell: "ultimate", pose: "☝️", poses: ["POINT"] },
];

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
 * the same entry point the keyboard fallback uses. Frames never leave the browser.
 */
export function GestureCamera({ ultimateReady = true, struggling = false, raceTarget = null, onRaceFeedback }: { ultimateReady?: boolean; struggling?: boolean; raceTarget?: RacePoseId | null; onRaceFeedback?: (feedback: PoseFeedback) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<GestureController | null>(null);
  const [enabled, setEnabled] = useState(readEnabled);
  const [status, setStatus] = useState<TrackingStatus>("CAMERA_OFF");
  const [pose, setPose] = useState<HandPose>("NONE");
  const [charge, setCharge] = useState<ActiveCharge | null>(null);
  const [chargeOutcome, setChargeOutcome] = useState<{ kind: ChargeKind; result: ChargeOutcome } | null>(null);
  const [lastCast, setLastCast] = useState<{ id: number; spell: SpellId } | null>(null);
  const charging = charge !== null;
  const [error, setError] = useState("");
  const raceCallback = useRef(onRaceFeedback);
  raceCallback.current = onRaceFeedback;

  useEffect(() => {
    const controller = new GestureController();
    controllerRef.current = controller;
    let castId = 0;
    // Mirrors `charge` so the action handler can read the current kind without a stale closure.
    let current: ActiveCharge | null = null;
    let handColor = HAND_COLOR.idle;
    const unsubscribers = [
      controller.onRaceFeedback((feedback) => raceCallback.current?.(feedback)),
      controller.onObservation((o) => {
        setStatus(o.status);
        setPose(o.pose);
        if (o.status === "ERROR") setError((e) => e || "Camera stopped. Turn gestures off and on to retry.");
      }),
      controller.onAction(({ action, localTimestampMs }) => {
        if (action === "FIREBALL_CHARGE_START" || action === "ULTIMATE_CHARGE_START") {
          const kind: ChargeKind = action === "ULTIMATE_CHARGE_START" ? "ultimate" : "fireball";
          // An upgrade keeps the original start time, matching the state machine.
          current = { kind, startedAt: current?.startedAt ?? localTimestampMs };
          setChargeOutcome(null);
          setCharge(current);
          handColor = HAND_COLOR[kind];
          startCharge(kind);
        }
        if (action === "FIREBALL_CAST" || action === "ULTIMATE_CAST" || action === "CHARGE_CANCEL") {
          const kind: ChargeKind = action === "ULTIMATE_CAST" ? "ultimate" : action === "FIREBALL_CAST" ? "fireball" : current?.kind ?? "fireball";
          current = null;
          handColor = HAND_COLOR.idle;
          setCharge(null);
          stopCharge(action === "CHARGE_CANCEL" ? 0.4 : 0.06);
          setChargeOutcome({ kind, result: action === "CHARGE_CANCEL" ? "fizzle" : "cast" });
        }
        if (action === "STRUGGLE_PUSH") return spellInput.push();
        const spell = ACTION_SPELLS[action];
        if (!spell) return;
        spellInput.cast(spell);
        setLastCast({ id: ++castId, spell });
      }),
      controller.onDebugFrame((frame) => {
        if (canvasRef.current) drawHands(canvasRef.current, frame.hands, handColor);
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

  useEffect(() => {
    controllerRef.current?.setStruggling(struggling);
  }, [struggling]);

  useEffect(() => { controllerRef.current?.setRaceTarget(raceTarget); }, [raceTarget]);

  useEffect(() => {
    if (!raceTarget) return;
    if (!enabled) raceCallback.current?.({ matched: null, hint: "Turn on the camera to match poses" });
    else if (status === "ERROR") raceCallback.current?.({ matched: null, hint: error || "Camera stopped. Turn gestures off and on to retry." });
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
    status === "STARTING" ? "Starting camera…" : raceTarget ? "Match the reference · face + hands in view" : status === "NO_HAND" ? "Show your hand" : struggling ? "✊✋ PUMP! PUMP!" : charge?.kind === "ultimate" ? "Charging… drop to strike" : charging ? "Charging… open to cast" : POSE_LABELS[pose] ?? "";

  return (
    <>
    <ChargeOrb charge={charge} outcome={chargeOutcome} ultimateReady={ultimateReady} />
    <aside className={`gesture-cam${raceTarget ? " pose-camera" : ""}${enabled ? " on" : ""}${charge ? ` is-charging charge-${charge.kind}` : ""}`}>
      {raceTarget && !enabled && <div className="pose-camera-placeholder"><b>Camera is off</b><span>Enable gestures below.<br />Keep your face and both hands in view.</span></div>}
      <div className="gesture-cam-view" hidden={!enabled}>
        <video ref={videoRef} className="mirrored" autoPlay playsInline muted />
        <canvas ref={canvasRef} className="mirrored" width={640} height={480} />
        <i className="gesture-cam-corner tl" /><i className="gesture-cam-corner tr" /><i className="gesture-cam-corner bl" /><i className="gesture-cam-corner br" />
        {live && <span className="gesture-cam-label">{label}</span>}
        {lastCast && (
          <span className="gesture-cam-cast" key={lastCast.id}>
            <SpellIcon spell={lastCast.spell} />
          </span>
        )}
      </div>
      {enabled && !raceTarget && (
        <ul className="gesture-cam-legend">
          {LEGEND.map(({ spell, pose: hint, poses }) => (
            // Light up the spell the moment its pose is recognized, before the hold completes.
            <li key={spell} className={spell === "ultimate" && !ultimateReady ? "locked" : live && poses.includes(pose) ? "armed" : ""}>
              <SpellIcon spell={spell} />
              <span>{hint}</span>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="gesture-cam-error">{error}</p>}
      {raceTarget && enabled && <button className="gesture-cam-toggle" onClick={() => controllerRef.current?.retryFaceTracking()}>Retry face tracking</button>}
      <button className="gesture-cam-toggle" onClick={toggle}>
        {enabled ? "Gestures on · turn off" : "🎥 Cast with gestures"}
      </button>
    </aside>
    </>
  );
}
