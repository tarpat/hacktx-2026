import type { Landmark } from "./types";

export interface CircleChargeFeedback {
  visible: boolean;
  progress: number;
  hint: string;
}
interface Point { x: number; y: number; at: number }
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const valid = (p: Landmark | undefined): p is Landmark => !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;

/** Recognizes a broad closed loop, in either direction, rather than a particular hand pose.
 * Raw palm positions avoid the casting pipeline's smoothing lag. Missing frames, teleports,
 * and hand changes clear the path. A circle needs coverage in both axes and consistent winding;
 * waving along a line, camera jitter, and reversing along an arc cannot charge the spell.
 */
export class CircleChargeCounter {
  private path: Point[] = [];
  private lastFrame = -Infinity;
  private lastPalm: Point | null = null;

  reset() { this.path = []; this.lastPalm = null; this.lastFrame = -Infinity; }

  update(hands: Landmark[][], now: number): CircleChargeFeedback & { push: boolean } {
    const feedback = (visible: boolean, progress = 0, push = false) => ({ visible, progress, push,
      hint: visible ? push ? "Charged! Keep circling!" : "Draw a big circle with one hand · either direction." : "Show one hand to the camera to charge your magic.",
    });
    if (now <= this.lastFrame) return feedback(false);
    if (now - this.lastFrame > 300) this.reset();
    this.lastFrame = now;
    const palms = hands.filter(hand => [0, 5, 9, 13, 17].every(i => valid(hand[i]))).map(hand => {
      const points = [0, 5, 9, 13, 17].map(i => hand[i]);
      return { x: points.reduce((n, p) => n + p.x, 0) / 5, y: points.reduce((n, p) => n + p.y, 0) / 5 * 0.75, at: now };
    });
    if (!palms.length) { this.path = []; this.lastPalm = null; return feedback(false); }
    // Keep following the same palm when MediaPipe reorders two hands.
    const previous = this.lastPalm;
    const palm = previous ? palms.reduce((a, b) => distance(a, previous) < distance(b, previous) ? a : b) : palms[0];
    if (previous && distance(previous, palm) > 0.22) this.path = [];
    this.lastPalm = palm;
    this.path = this.path.filter(p => now - p.at <= 2800);
    if (this.path.length && distance(this.path[this.path.length - 1], palm) < 0.012) return feedback(true, this.progress());
    this.path.push(palm);
    if (this.path.length > 100) this.path.shift();
    const progress = this.progress();
    if (progress >= 1) { this.path = [palm]; return feedback(true, 1, true); }
    return feedback(true, progress);
  }

  private progress(): number {
    const points = this.path;
    if (points.length < 10 || points[points.length - 1].at - points[0].at < 350) return 0;
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const width = Math.max(...xs) - Math.min(...xs), height = Math.max(...ys) - Math.min(...ys);
    if (width < 0.10 || height < 0.075 || Math.min(width, height) / Math.max(width, height) < 0.4) return 0;
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    let turn = 0, travel = 0;
    for (let i = 1; i < points.length; i++) {
      const a = Math.atan2(points[i - 1].y - cy, points[i - 1].x - cx);
      const b = Math.atan2(points[i].y - cy, points[i].x - cx);
      const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
      // A jump across the middle is not a circular stroke.
      if (Math.abs(delta) > Math.PI / 2) return 0;
      turn += delta; travel += Math.abs(delta);
    }
    const winding = Math.abs(turn);
    if (!travel || winding / travel < 0.8) return 0;
    const progress = Math.min(0.99, winding / (Math.PI * 2));
    const closed = distance(points[0], points[points.length - 1]) < Math.min(width, height) * 0.45;
    return winding >= Math.PI * 1.8 && closed ? 1 : progress;
  }
}
