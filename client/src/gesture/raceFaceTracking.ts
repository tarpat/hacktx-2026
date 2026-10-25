import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { tonguePixels, type RaceFrame } from "./racePoseMatcher";
import type { Landmark } from "./types";

let pending: Promise<FaceLandmarker> | null = null;
export function loadRaceFaceTracker(): Promise<FaceLandmarker> {
  pending ??= (async () => {
    const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm");
    const create = (delegate: "GPU" | "CPU") => FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task", delegate },
      runningMode: "VIDEO", numFaces: 1, outputFaceBlendshapes: true,
      minFaceDetectionConfidence: 0.65, minFacePresenceConfidence: 0.65, minTrackingConfidence: 0.6,
    });
    try { return await create("GPU"); } catch { return await create("CPU"); }
  })();
  pending.catch(() => { pending = null; });
  return pending;
}

export class RaceFaceReader {
  private canvas = document.createElement("canvas");
  constructor() { this.canvas.width = 320; this.canvas.height = 240; }

  read(tracker: FaceLandmarker, video: HTMLVideoElement, hands: Landmark[][], now: number): RaceFrame {
    const output = tracker.detectForVideo(video, now);
    const face = output.faceLandmarks[0] ?? [];
    const shapes = output.faceBlendshapes[0]?.categories ?? [];
    const score = (name: string) => shapes.find((c) => c.categoryName === name)?.score ?? 0;
    let tongueVisible = false;
    const context = this.canvas.getContext("2d", { willReadFrequently: true });
    if (face.length && context && score("jawOpen") > 0.32) {
      context.drawImage(video, 0, 0, 320, 240);
      const mouthWidth = Math.abs(face[291].x - face[61].x);
      const gap = Math.abs(face[14].y - face[13].y);
      const centerX = (face[61].x + face[291].x) / 2;
      const x = Math.max(0, Math.floor((centerX - mouthWidth * 0.18) * 320));
      const y = Math.max(0, Math.floor((face[13].y + gap * 0.45) * 240));
      const w = Math.min(320 - x, Math.ceil(mouthWidth * 0.36 * 320));
      const h = Math.min(240 - y, Math.ceil(gap * 0.85 * 240));
      const cheek = face[205];
      const cheekX = Math.max(0, Math.min(317, Math.floor(cheek.x * 320)));
      const cheekY = Math.max(0, Math.min(237, Math.floor(cheek.y * 240)));
      const skin = context.getImageData(cheekX, cheekY, 3, 3).data;
      let redness = 0;
      for (let i = 0; i < skin.length; i += 4) redness += skin[i] - skin[i + 1];
      if (w >= 3 && h >= 3) tongueVisible = tonguePixels(context.getImageData(x, y, w, h).data, w, h, redness / 9);
    }
    return { face, hands, jawOpen: score("jawOpen"), smile: (score("mouthSmileLeft") + score("mouthSmileRight")) / 2, tongueVisible, aspect: video.videoWidth / video.videoHeight };
  }
}
