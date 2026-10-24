import { useEffect, useRef, useState } from "react";
import type { SpellId } from "@spellcaster/shared";
import { spellInput } from "../game/input";
import { spellGlyph } from "../theme";
import { ChargeOrb, type ActiveCharge, type ChargeOutcome } from "./ChargeOrb";
import { SixSevenBar } from "./SixSevenBar";
import { drawHands } from "./drawHand";
import { GestureController } from "./GestureController";
import type { ChargeKind } from "./gestureStateMachine";
import type { GestureAction, HandPose, TrackingStatus } from "./types";

/** Gesture action → engine spell. Charge start/cancel are local feedback only. */
const ACTION_SPELLS: Partial<Record<GestureAction, SpellId>> = {
  FIREBALL_CAST: "fireball",
  SHIELD_CAST: "shield",
  ICE_CAST: "ice",
  ULTIMATE_CAST: "ultimate",
  SIX_SEVEN_CAST: "sixSeven",
};

const POSE_LABELS: Partial<Record<HandPose, string>> = { FIST: "✊", OPEN_PALM: "✋", VICTORY: "✌️", BOTH_FISTS: "✊✊", BOTH_PALMS: "🙌" };

const LEGEND = "✊→✋ fireball · ✊✊→🙌 ultimate · ✋ shield · ✌️ ice · 🫴🫴 6-7";

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
  const [sixSeven, setSixSeven] = useState({ charge: 0, speed: 0 });
  const [palmsUp, setPalmsUp] = useState(false);

  useEffect(() => {
    const controller = new GestureController();
    controllerRef.current = controller;
    let castId = 0;
    // Mirrors `charge` so the action handler can read the current kind without a stale closure.
    let current: ActiveCharge | null = null;
    const unsubscribers = [
      controller.onObservation((o) => {
        setStatus(o.status);
        setPose(o.pose);
        setSixSeven({ charge: o.sixSevenCharge, speed: o.sixSevenSpeed });
        setPalmsUp(o.palmsUp);
        if (o.status === "ERROR") setError((e) => e || "Camera stopped. Turn gestures off and on to retry.");
      }),
      controller.onAction(({ action, localTimestampMs, power }) => {
        if (action === "FIREBALL_CHARGE_START" || action === "ULTIMATE_CHARGE_START") {
          const kind: ChargeKind = action === "ULTIMATE_CHARGE_START" ? "ultimate" : "fireball";
          // An upgrade keeps the original start time, matching the state machine.
          current = { kind, startedAt: current?.startedAt ?? localTimestampMs };
          setChargeOutcome(null);
          setCharge(current);
        }
        if (action === "FIREBALL_CAST" || action === "ULTIMATE_CAST" || action === "CHARGE_CANCEL") {
          const kind: ChargeKind = action === "ULTIMATE_CAST" ? "ultimate" : action === "FIREBALL_CAST" ? "fireball" : current?.kind ?? "fireball";
          current = null;
          setCharge(null);
          setChargeOutcome({ kind, result: action === "CHARGE_CANCEL" ? "fizzle" : "cast" });
        }
        if (action === "STRUGGLE_PUSH") return spellInput.push();
        const spell = ACTION_SPELLS[action];
        if (!spell) return;
        spellInput.cast(spell, undefined, power);
        setLastCast({ id: ++castId, spell });
      }),
      controller.onDebugFrame((frame) => {
        if (canvasRef.current) drawHands(canvasRef.current, frame.hands, frame.pose);
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
    status === "STARTING" ? "Starting camera…" : status === "NO_HAND" ? "Show your hand" : struggling ? "✊✋ PUMP! PUMP!" : charging ? "Charging… open to cast" : palmsUp ? "🫴🫴 palms up · bob!" : POSE_LABELS[pose] ?? "";

  return (
    <>
    <ChargeOrb charge={charge} outcome={chargeOutcome} ultimateReady={ultimateReady} />
    <SixSevenBar charge={sixSeven.charge} speed={sixSeven.speed} active={palmsUp} />
    <aside className={`gesture-cam${enabled ? " on" : ""}${charging ? " is-charging" : ""}`}>
      <div className="gesture-cam-view" hidden={!enabled}>
        <video ref={videoRef} className="mirrored" autoPlay playsInline muted />
        <canvas ref={canvasRef} className="mirrored" width={640} height={480} />
        {live && <span className="gesture-cam-label">{label}</span>}
        {lastCast && (
          <span className="gesture-cam-cast" key={lastCast.id}>
            {spellGlyph[lastCast.spell]}
          </span>
        )}
      </div>
      {enabled && <p className="gesture-cam-legend">{LEGEND}</p>}
      {error && <p className="gesture-cam-error">{error}</p>}
      <button className="gesture-cam-toggle" onClick={toggle}>
        {enabled ? "Gestures on · turn off" : "🎥 Cast with gestures"}
      </button>
    </aside>
    </>
  );
}
