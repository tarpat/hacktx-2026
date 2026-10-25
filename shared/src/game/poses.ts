/** Human-readable targets transcribed from the supplied reference images. */
export const POSE_SEQUENCE = [
  { id: "think", name: "The thinker", cue: "Touch the corner of your mouth with your index finger. Keep your mouth closed.", image: "/poses/think.png" },
  { id: "tongue", name: "Tongue out", cue: "Open your mouth and stick your tongue out toward the camera. Keep hands away.", image: "/poses/tongue.png" },
  { id: "think-again", name: "Think again", cue: "Index finger at your mouth again, lips closed. Either hand works.", image: "/poses/think-again.png" },
  { id: "gasp", name: "The gasp", cue: "Open your mouth wide and bring both hands together just below your chin.", image: "/poses/gasp.png" },
  { id: "grin", name: "Cheeky grin", cue: "Raise one index or middle finger beside your face and give a small smile. Either hand works; keep the other fingers relaxed and curled.", image: "/poses/grin.png" },
] as const;

export type RacePoseId = typeof POSE_SEQUENCE[number]["id"];
export const POSE_RACE = { countdownMs: 3_000, durationMs: 25_000, holdMs: 450, releaseMs: 180, sampleGapMs: 350, sampleIntervalMs: 100 } as const;

export interface PoseProgress {
  step: number;
  released: boolean;
  neutralSince: number | null;
  holdSince: number | null;
  lastSampleAt: number;
}

export interface PoseRace {
  id: string;
  readyAt: number;
  progress: Record<"A" | "B", PoseProgress>;
}

/** null = tracking unavailable; false = tracked but not matching the target. No camera data is sent. */
export interface PoseSample {
  struggleId: string;
  step: number;
  matched: boolean | null;
}
