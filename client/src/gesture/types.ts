/** Single-hand poses plus combined two-hand poses (see combinePoses). */
export type HandPose = "NONE" | "FIST" | "OPEN_PALM" | "VICTORY" | "POINT" | "BOTH_FISTS" | "BOTH_PALMS" | "UNKNOWN";

export type GestureAction =
  | "FIREBALL_CHARGE_START"
  /** Fired at charge start with both fists, or when a fireball charge upgrades. */
  | "ULTIMATE_CHARGE_START"
  | "CHARGE_CANCEL"
  | "FIREBALL_CAST"
  | "ULTIMATE_CAST"
  | "SHIELD_CAST"
  | "ICE_CAST"
  /** One fist pump during a spell struggle. */
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
