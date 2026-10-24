export type HandPose = "NONE" | "FIST" | "OPEN_PALM" | "VICTORY" | "UNKNOWN";

export type GestureAction =
  | "FIREBALL_CHARGE_START"
  | "FIREBALL_CHARGE_CANCEL"
  | "FIREBALL_CAST"
  | "SHIELD_START"
  | "SHIELD_END";

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
