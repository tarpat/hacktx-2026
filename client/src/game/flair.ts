import type { PlayerSlot } from "@spellcaster/shared";
import { playerName } from "../theme";

/**
 * Personal touches layered on the duel: each player's typed name, a live webcam face for
 * their wizard, and the snapshot taken the moment they lose. Online, these travel to the
 * rival through the server's FLAIR relay; nothing is stored anywhere.
 */
export interface Flair {
  name?: string;
  /** Round PNG data URL of the player's face, refreshed during the duel. */
  face?: string;
  /** The face captured at the knockout. */
  ko?: string;
}

const DEFAULT_NAMES: Record<PlayerSlot, string> = { ...playerName };
const flair: Record<PlayerSlot, Flair> = { A: {}, B: {} };
const listeners = new Set<() => void>();

export const MAX_NAME = 20;
/** Upper bound on an image data URL; a 96px PNG is far smaller. */
export const MAX_IMAGE = 60_000;

export function cleanName(name: string) {
  return name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
}

export function getFlair(slot: PlayerSlot): Flair {
  return flair[slot];
}

export function setFlair(slot: PlayerSlot, patch: Flair) {
  if (patch.name !== undefined) {
    const name = cleanName(patch.name);
    flair[slot].name = name || undefined;
    // The HUD, narrator and victory card all read playerName, so a name shows everywhere.
    playerName[slot] = name || DEFAULT_NAMES[slot];
  }
  if (patch.face !== undefined) flair[slot].face = patch.face || undefined;
  if (patch.ko !== undefined) flair[slot].ko = patch.ko || undefined;
  listeners.forEach((listener) => listener());
}

/** Clears faces between matches; names stay. */
export function clearFaces() {
  for (const slot of ["A", "B"] as PlayerSlot[]) setFlair(slot, { face: "", ko: "" });
}

export function onFlairChange(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ---------- your own name ----------

const NAME_KEY = "spellcaster:name";

export function loadMyName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveMyName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, cleanName(name));
  } catch {
    // Storage blocked; the name still applies to this visit.
  }
}

// ---------- webcam face capture ----------

let faceVideo: HTMLVideoElement | null = null;
const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;

/** The gesture camera registers its video so the duel can borrow frames from it. */
export function setFaceSource(video: HTMLVideoElement | null) {
  faceVideo = video;
}

/**
 * Grabs the current webcam frame as a round, gold-ringed face. Players sit centered in
 * front of the camera, so a square from the upper middle of the frame holds the face.
 */
export function captureFace(size = 96): string | null {
  const video = faceVideo;
  if (!canvas || !video || video.readyState < 2 || !video.videoWidth) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  canvas.width = canvas.height = size;
  const side = Math.min(video.videoWidth, video.videoHeight) * 0.62;
  const sx = (video.videoWidth - side) / 2;
  const sy = Math.max(0, video.videoHeight * 0.36 - side / 2);
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
  ctx.clip();
  // Mirror it, like the preview, so it feels like looking in a mirror.
  ctx.translate(size, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, sx, sy, side, side, 0, 0, size, size);
  ctx.restore();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#f6c453";
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 1.5, 0, Math.PI * 2);
  ctx.stroke();
  return canvas.toDataURL("image/png");
}
