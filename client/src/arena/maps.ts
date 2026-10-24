export type MapId = "twin-ledges" | "high-plateau" | "staggered-rise";

/** A floating vine ledge: center x and y as a fraction of the arena, width as a fraction of its width. */
export interface Ledge {
  x: number;
  y: number;
  width: number;
  flipX?: boolean;
  bob?: number;
}

export interface ArenaMap {
  id: MapId;
  name: string;
  blurb: string;
  ledges: Ledge[];
}

// Ledges sit gracefully in the upper forest canopy above the wizards and spells.
export const MAPS: Record<MapId, ArenaMap> = {
  "twin-ledges": {
    id: "twin-ledges",
    name: "Twin Ledges",
    blurb: "Symmetrical duelists' balconies frame the arena, crowned by a high spire lookout.",
    ledges: [
      { x: 0.5, y: 0.13, width: 0.22, bob: 4 },
      { x: 0.25, y: 0.28, width: 0.21, bob: 5 },
      { x: 0.75, y: 0.28, width: 0.21, flipX: true, bob: 5 },
      { x: 0.13, y: 0.44, width: 0.17, bob: 6 },
      { x: 0.87, y: 0.44, width: 0.17, flipX: true, bob: 6 },
    ],
  },
  "high-plateau": {
    id: "high-plateau",
    name: "High Plateau",
    blurb: "A grand sky terrace spans the upper canopy with stepped approach boughs.",
    ledges: [
      { x: 0.5, y: 0.16, width: 0.36, bob: 4 },
      { x: 0.22, y: 0.3, width: 0.22, bob: 5 },
      { x: 0.78, y: 0.3, width: 0.22, flipX: true, bob: 5 },
      { x: 0.5, y: 0.46, width: 0.22, bob: 6 },
    ],
  },
  "staggered-rise": {
    id: "staggered-rise",
    name: "Staggered Rise",
    blurb: "Vine boughs ascend dynamically across the glade toward the waterfall cliffs.",
    ledges: [
      { x: 0.17, y: 0.48, width: 0.18, bob: 6 },
      { x: 0.38, y: 0.36, width: 0.2, bob: 5 },
      { x: 0.59, y: 0.24, width: 0.21, flipX: true, bob: 5 },
      { x: 0.81, y: 0.13, width: 0.22, flipX: true, bob: 4 },
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
