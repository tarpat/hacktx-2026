import type { Landmark } from "./types";

export interface BodyLandmark extends Landmark { visibility: number }
export type ForearmPosition = "up" | "down" | null;
export interface SixSevenFeedback {
  visible: boolean;
  left: ForearmPosition;
  right: ForearmPosition;
  hint: string;
}

interface ArmState {
  position: ForearmPosition;
  candidate: ForearmPosition;
  since: number;
  frames: number;
}
const arm = (): ArmState => ({ position: null, candidate: null, since: 0, frames: 0 });
const inView = (p: BodyLandmark | undefined): p is BodyLandmark => !!p &&
  Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.visibility) &&
  p.visibility >= 0.5 && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;

/**
 * MediaPipe elbow/wrist crossings, inspired by mannygonzalezj7/67counter.
 * A down → up crossing of either forearm scores once. The first pose is only a
 * baseline. Hysteresis and time confirmation reject jitter near elbow height;
 * losing tracking clears the baseline, so returning to frame cannot score.
 */
export class SixSevenCounter {
  private arms = [arm(), arm()];
  private lastPush = -Infinity;
  private lastFrame = -Infinity;

  update(points: BodyLandmark[], now: number): SixSevenFeedback & { push: boolean } {
    if (now <= this.lastFrame) return { ...this.feedback(false), push: false };
    if (now - this.lastFrame > 250) this.reset();
    this.lastFrame = now;
    const elbows = [points[13], points[14]];
    const wrists = [points[15], points[16]];
    if (![...elbows, ...wrists].every(inView)) {
      this.arms = [arm(), arm()];
      return { ...this.feedback(false), push: false };
    }
    // Scale the dead band to the body where possible, with a safe camera-space floor.
    const shoulders = [points[11], points[12]];
    const width = shoulders.every(inView) ? Math.abs(shoulders[0].x - shoulders[1].x) : 0.25;
    const margin = Math.max(0.015, Math.min(0.045, width * 0.1));
    let raised = false;
    this.arms.forEach((state, i) => {
      const delta = elbows[i].y - wrists[i].y;
      const next: ForearmPosition = delta > margin ? "up" : delta < -margin ? "down" : null;
      if (!next || next === state.position) {
        state.candidate = null;
        state.frames = 0;
        return;
      }
      if (next !== state.candidate) {
        state.candidate = next;
        state.since = now;
        state.frames = 0;
      }
      state.frames++;
      if (state.frames < 2 || now - state.since < 45) return;
      raised ||= state.position === "down" && next === "up";
      state.position = next;
      state.candidate = null;
      state.frames = 0;
    });
    // Both arms rising together are one beat, never two pushes on the same frame.
    const push = raised && now - this.lastPush >= 120;
    if (push) this.lastPush = now;
    return { ...this.feedback(true), push };
  }

  reset(): void {
    this.arms = [arm(), arm()];
    this.lastFrame = -Infinity;
    this.lastPush = -Infinity;
  }

  private feedback(visible: boolean): SixSevenFeedback {
    return {
      visible, left: this.arms[0].position, right: this.arms[1].position,
      hint: visible ? "6–7! Rock your forearms up and down." : "Step back until both elbows and wrists are in view.",
    };
  }
}
