/** Single-hand poses plus combined two-hand poses (see combinePoses). */
export type HandPose = "NONE" | "FIST" | "OPEN_PALM" | "VICTORY" | "POINT" | "HORNS" | "BOTH_FISTS" | "BOTH_PALMS" | "UNKNOWN";

export type GestureAction =
  | "FIREBALL_CHARGE_START"
  /** Fired when a finger pointed at the sky has been held long enough. */
  | "ULTIMATE_CHARGE_START"
  | "CHARGE_CANCEL"
  | "FIREBALL_CAST"
  | "ULTIMATE_CAST"
  | "SHIELD_CAST"
  | "ICE_CAST"
  /** 🤘 Hook 'em, held. */
  | "TAURUS_CAST"
  /** One confirmed forearm lift during the 6–7 collision challenge. */
  | "STRUGGLE_PUSH";

export type TrackingStatus = "CAMERA_OFF" | "STARTING" | "TRACKING" | "NO_HAND" | "ERROR";

export type Handedness = "Left" | "Right";

export interface GestureActionEvent {
  action: GestureAction;
  /** performance.now() clock; local only, never use for cross-device ordering. */
  localTimestampMs: number;
  hand?: Handedness;
}

export interface GestureObservation {
  /** Smoothed pose (majority over recent frames). */
  pose: HandPose;
  /** Raw single-frame pose, for debugging flicker. */
  rawPose: HandPose;
  status: TrackingStatus;
  hand?: Handedness;
  timestampMs: number;
}

export interface Landmark {
  x: number;
  y: number;
  z: number;
}
