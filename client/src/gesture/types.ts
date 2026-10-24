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
  | "SIX_SEVEN_CAST";

export type TrackingStatus = "CAMERA_OFF" | "STARTING" | "TRACKING" | "NO_HAND" | "ERROR";

export type Handedness = "Left" | "Right";

export interface GestureActionEvent {
  action: GestureAction;
  /** performance.now() clock; local only, never use for cross-device ordering. */
  localTimestampMs: number;
  hand?: Handedness;
  /** Charge power (0–1) for SIX_SEVEN_CAST. */
  power?: number;
}

export interface GestureObservation {
  /** Smoothed pose (majority over recent frames). */
  pose: HandPose;
  /** Raw single-frame pose, for debugging flicker. */
  rawPose: HandPose;
  status: TrackingStatus;
  hand?: Handedness;
  /** Six Seven charge bar, 0–1. */
  sixSevenCharge: number;
  /** Current 6-7 bobbing speed, swaps per second. */
  sixSevenSpeed: number;
  /** Both palms read as facing up (the 6-7 stance). */
  palmsUp: boolean;
  timestampMs: number;
}

export interface Landmark {
  x: number;
  y: number;
  z: number;
}
