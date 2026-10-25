import type { RacePoseId } from "@spellcaster/shared";
import type { Landmark } from "./types";

export interface RaceFrame {
  face: Landmark[];
  hands: Landmark[][];
  jawOpen: number;
  smile: number;
  tongueVisible: boolean;
  aspect: number;
}
export interface PoseFeedback { matched: boolean | null; hint: string }

/** Compare geometry in image pixels, normalized by face width; never compare monkey/human pixels. */
export function matchRacePose(target: RacePoseId, frame: RaceFrame): PoseFeedback {
  const { face, hands, jawOpen, smile, tongueVisible, aspect } = frame;
  const result = (matched: boolean, hint: string): PoseFeedback => ({ matched, hint: matched ? "Match found — hold it!" : hint });
  if (face.length < 468) return { matched: null, hint: "Keep your whole face in the camera" };
  const distance = (a: Landmark, b: Landmark) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
  const width = distance(face[234], face[454]);
  if (width < 0.12) return { matched: null, hint: "Move closer so your face is clear" };
  const mouth = { x: (face[13].x + face[14].x) / 2, y: (face[13].y + face[14].y) / 2, z: 0 };
  const gap = distance(face[13], face[14]) / Math.max(0.001, distance(face[61], face[291]));
  const open = jawOpen > 0.32 && gap > 0.23;
  const validHands = hands.filter((h) => h.length === 21);
  const extended = (h: Landmark[], pip: number, tip: number) => distance(h[0], h[tip]) > distance(h[0], h[pip]) * 1.15;
  const curled = (h: Landmark[], pip: number, tip: number) => distance(h[0], h[tip]) < distance(h[0], h[pip]) * 1.07;
  if (target === "think" || target === "think-again") {
    const pointing = validHands.some((h) => distance(h[8], mouth) / width < 0.24 &&
      curled(h, 10, 12) && curled(h, 14, 16) && curled(h, 18, 20) &&
      distance(h[8], h[0]) > distance(h[12], h[0]) * 1.08);
    return result(pointing && jawOpen < 0.28 && gap < 0.22, pointing ? "Close your mouth gently" : "Index fingertip to the corner of your mouth; curl the other fingers");
  }
  if (target === "tongue") {
    const clear = !validHands.some((h) => distance(h[9], mouth) < width * 0.65);
    return result(open && tongueVisible && clear, !clear ? "Move your hands away from your mouth" : !open ? "Open your mouth and stick your tongue out" : "Stick your tongue farther out; face a bright light");
  }
  if (target === "gasp") {
    if (validHands.length < 2) return result(false, "Show both hands together below your chin");
    const [a, b] = validHands;
    const below = (h: Landmark[]) => h[9].y > mouth.y + width * 0.1 && h[9].y < face[152].y + width * 1.2 && Math.abs(h[9].x - mouth.x) * aspect < width * 0.85;
    return result(open && below(a) && below(b) && distance(a[9], b[9]) < width * 0.75, !open ? "Open your mouth wide in surprise" : "Bring both hands together just below your chin");
  }
  const raised = validHands.some((h) => extended(h, 10, 12) && curled(h, 6, 8) && curled(h, 14, 16) && curled(h, 18, 20) &&
    h[12].y < h[10].y && Math.abs(h[12].x - mouth.x) * aspect < width * 1.6 && h[12].y < mouth.y);
  return result(raised && smile > 0.35, raised ? "Give the camera a big grin" : "Raise only your middle finger beside your face, then smile");
}

/** A local color heuristic, not a learned tongue classifier. Samples the center of the open mouth. */
export function tonguePixels(pixels: Uint8ClampedArray, width: number, height: number, cheekRedness: number): boolean {
  if (width < 3 || height < 3) return false;
  let count = 0;
  let rows = 0;
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]];
      if (r > 65 && r > g * 1.18 && r > b * 1.08 && r - g > cheekRedness + 12) row++;
    }
    count += row;
    if (row / width > 0.35) rows++;
  }
  return count / (width * height) > 0.38 && rows / height > 0.55;
}
