export const cues = {
  cast: { label: "Fireball cast", file: "cast.wav", gain: 0.65 },
  shield: { label: "Shield raised", file: "shield.wav", gain: 0.55 },
  block: { label: "Shield block", file: "block.wav", gain: 0.65 },
  hit: { label: "Damage hit", file: "hit.wav", gain: 0.6 },
  countdown: { label: "Countdown", file: "countdown.wav", gain: 0.5 },
  victory: { label: "Victory", file: "victory.wav", gain: 0.6 },
} as const;

export type CueId = keyof typeof cues;
