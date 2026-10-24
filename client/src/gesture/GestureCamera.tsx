import { useEffect, useRef, useState } from "react";
import type { SpellId } from "@spellcaster/shared";
import { spellInput } from "../game/input";
import { drawHand } from "./drawHand";
import { GestureController } from "./GestureController";
import type { GestureAction, HandPose, TrackingStatus } from "./types";

/** Gesture action → engine spell. Charge start/cancel are local feedback only. */
const ACTION_SPELLS: Partial<Record<GestureAction, SpellId>> = {
  FIREBALL_CAST: "fireball",
  SHIELD_CAST: "shield",
  ICE_CAST: "ice",
  ULTIMATE_CAST: "ultimate",
};

const SPELL_GLYPHS: Record<SpellId, string> = { fireball: "🔥", shield: "🛡️", ice: "❄️", ultimate: "⚡" };

const POSE_LABELS: Partial<Record<HandPose, string>> = { FIST: "✊", OPEN_PALM: "✋", VICTORY: "✌️", POINT: "☝️" };

const LEGEND = "✊→✋ fireball · ✋ shield · ✌️ ice · ☝️ ultimate";

// Remember the opt-in for this tab so the camera follows the player from lobby to arena.
const STORAGE_KEY = "spellcaster:gestures";
function readEnabled() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
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
export function GestureCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<GestureController | null>(null);
  const [enabled, setEnabled] = useState(readEnabled);
  const [status, setStatus] = useState<TrackingStatus>("CAMERA_OFF");
  const [pose, setPose] = useState<HandPose>("NONE");
  const [charging, setCharging] = useState(false);
  const [lastCast, setLastCast] = useState<{ id: number; spell: SpellId } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new GestureController();
    controllerRef.current = controller;
    let castId = 0;
    const unsubscribers = [
      controller.onObservation((o) => {
        setStatus(o.status);
        setPose(o.pose);
        if (o.status === "ERROR") setError((e) => e || "Camera stopped. Turn gestures off and on to retry.");
      }),
      controller.onAction(({ action }) => {
        if (action === "FIREBALL_CHARGE_START") setCharging(true);
        if (action === "FIREBALL_CHARGE_CANCEL" || action === "FIREBALL_CAST") setCharging(false);
        const spell = ACTION_SPELLS[action];
        if (!spell) return;
        spellInput.cast(spell);
        setLastCast({ id: ++castId, spell });
      }),
      controller.onDebugFrame((frame) => {
        if (canvasRef.current) drawHand(canvasRef.current, frame.landmarks);
      }),
    ];
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      controller.stop();
    };
  }, []);

  useEffect(() => {
    const controller = controllerRef.current;
    const video = videoRef.current;
    if (!controller || !video) return;
    if (!enabled) {
      controller.stop();
      setCharging(false);
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
    status === "STARTING" ? "Starting camera…" : status === "NO_HAND" ? "Show your hand" : charging ? "Charging… open to cast" : POSE_LABELS[pose] ?? "";

  return (
    <aside className={`gesture-cam${enabled ? " on" : ""}${charging ? " is-charging" : ""}`}>
      <div className="gesture-cam-view" hidden={!enabled}>
        <video ref={videoRef} className="mirrored" autoPlay playsInline muted />
        <canvas ref={canvasRef} className="mirrored" width={640} height={480} />
        {live && <span className="gesture-cam-label">{label}</span>}
        {lastCast && (
          <span className="gesture-cam-cast" key={lastCast.id}>
            {SPELL_GLYPHS[lastCast.spell]}
          </span>
        )}
      </div>
      {enabled && <p className="gesture-cam-legend">{LEGEND}</p>}
      {error && <p className="gesture-cam-error">{error}</p>}
      <button className="gesture-cam-toggle" onClick={toggle}>
        {enabled ? "Gestures on · turn off" : "🎥 Cast with gestures"}
      </button>
    </aside>
  );
}
