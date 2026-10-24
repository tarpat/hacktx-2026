export type MapId = "twin-ledges" | "high-plateau" | "staggered-rise";

/** A floating vine ledge: center x and y as a fraction of the arena, width as a fraction of its width. */
export interface Ledge {
  x: number;
  y: number;
  width: number;
}

export interface ArenaMap {
  id: MapId;
  name: string;
  blurb: string;
  ledges: Ledge[];
}

// Ledges sit above the spells' flight path (about 50-60% down) so they never hide a cast.
export const MAPS: Record<MapId, ArenaMap> = {
  "twin-ledges": {
    id: "twin-ledges",
    name: "Twin Ledges",
    blurb: "Two vine ledges flank the tower, with a lookout up top.",
    ledges: [
      { x: 0.5, y: 0.17, width: 0.2 },
      { x: 0.3, y: 0.36, width: 0.24 },
      { x: 0.7, y: 0.36, width: 0.24 },
    ],
  },
  "high-plateau": {
    id: "high-plateau",
    name: "High Plateau",
    blurb: "A long bough spans the clearing beneath a high perch.",
    ledges: [
      { x: 0.32, y: 0.18, width: 0.2 },
      { x: 0.5, y: 0.35, width: 0.48 },
    ],
  },
  "staggered-rise": {
    id: "staggered-rise",
    name: "Staggered Rise",
    blurb: "Branches climb unevenly toward the lanterns.",
    ledges: [
      { x: 0.52, y: 0.16, width: 0.22 },
      { x: 0.3, y: 0.35, width: 0.26 },
      { x: 0.73, y: 0.27, width: 0.26 },
    ],
  },
};

export const MAP_ORDER: MapId[] = ["twin-ledges", "high-plateau", "staggered-rise"];

const STORAGE_KEY = "spellcaster.map";

export function loadMapChoice(): MapId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved in MAPS) return saved as MapId;
  } catch {
    // Storage can be unavailable (private windows); fall back to the default map.
  }
  return "twin-ledges";
}

export function saveMapChoice(id: MapId) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Choice just won't persist across reloads.
  }
}
