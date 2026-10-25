/** The shared order maps the serialized stage index to the client's arena layout. */
export const ARENA_IDS = ["twin-ledges", "high-plateau", "staggered-rise"] as const;
export type ArenaId = typeof ARENA_IDS[number];

/** Independent uniform draw for every match. Repeats are allowed, including rematches. */
export function randomStageId(random: () => number = Math.random): number {
  return Math.floor(random() * ARENA_IDS.length);
}
