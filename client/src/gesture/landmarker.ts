import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import type { Handedness, Landmark } from "./types";

// Self-hosted so tracking works without internet. The wasm is served from node_modules by vite.config.ts.
const asset = (path: string) => new URL(`${import.meta.env.BASE_URL}${path}`, self.location.href).href;
const WASM_URL = asset("mediapipe/wasm");
const MODEL_URL = asset("models/hand_landmarker.task");

export interface Detection {
  landmarks: Landmark[][];
  handedness: (Handedness | undefined)[];
}

/** Loads the hand landmarker on whichever thread calls it, preferring the GPU. */
export async function createLandmarker(): Promise<HandLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  const create = (delegate: "GPU" | "CPU") =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: "VIDEO",
      numHands: 2,
      // Stricter than MediaPipe's 0.5 defaults: fewer ghost hands from faces, sleeves and background.
      minHandDetectionConfidence: 0.7,
      minHandPresenceConfidence: 0.7,
      minTrackingConfidence: 0.6,
    });
  try {
    return await create("GPU");
  } catch {
    return await create("CPU");
  }
}

export function toDetection(result: { landmarks: Landmark[][]; handedness: { categoryName: string }[][] }): Detection {
  return {
    landmarks: result.landmarks.map((hand) => hand.map(({ x, y, z }) => ({ x, y, z }))),
    handedness: result.handedness.map((categories) => categories[0]?.categoryName as Handedness | undefined),
  };
}

export type WorkerRequest = { type: "frame"; frame: ImageBitmap; timestamp: number };
export type WorkerReply = { type: "ready" } | { type: "result"; detection: Detection } | { type: "error"; message: string };
