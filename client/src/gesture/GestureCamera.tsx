import { useEffect, useRef, useState } from "react";
import type { SpellId } from "@spellcaster/shared";
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

/** Webcams drop their frame rate in dim light; warn after it stays low this long. */
const LOW_FPS = 20;
const LOW_FPS_MS = 2000;

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
export function GestureCamera({ ultimateReady = true, struggling = false }: { ultimateReady?: boolean; struggling?: boolean }) {
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
  const [lowLight, setLowLight] = useState(false);

  useEffect(() => {
    const controller = new GestureController();
    controllerRef.current = controller;
    let castId = 0;
    // Mirrors `charge` so the action handler can read the current kind without a stale closure.
    let current: ActiveCharge | null = null;
    let handColor = HAND_COLOR.idle;
    let lowSince: number | null = null;
    const unsubscribers = [
      controller.onObservation((o) => {
        setStatus(o.status);
        setPose(o.pose);
        if (o.status !== "TRACKING" && o.status !== "NO_HAND") {
          lowSince = null;
          setLowLight(false);
        }
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
        const now = performance.now();
        lowSince = frame.fps < LOW_FPS ? lowSince ?? now : null;
        setLowLight(lowSince !== null && now - lowSince > LOW_FPS_MS);
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
    status === "STARTING" ? "Starting camera…" : status === "NO_HAND" ? "Show your hand" : struggling ? "✊✋ PUMP! PUMP!" : charge?.kind === "ultimate" ? "Charging… drop to strike" : charging ? "Charging… open to cast" : lowLight ? "💡 More light on your hands" : POSE_LABELS[pose] ?? "";

  return (
    <>
    <ChargeOrb charge={charge} outcome={chargeOutcome} ultimateReady={ultimateReady} />
    <aside className={`gesture-cam${enabled ? " on" : ""}${charge ? ` is-charging charge-${charge.kind}` : ""}`}>
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
      {enabled && (
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
      <button className="gesture-cam-toggle" onClick={toggle}>
        {enabled ? "Gestures on · turn off" : "🎥 Cast with gestures"}
      </button>
    </aside>
    </>
  );
}
