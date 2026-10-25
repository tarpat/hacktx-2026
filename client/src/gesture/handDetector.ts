import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { createLandmarker, toDetection, type Detection, type WorkerReply, type WorkerRequest } from "./landmarker";

/** Runs detection on video frames. One frame is in flight at a time; frames that arrive meanwhile are skipped. */
export interface HandDetector {
  detect(video: HTMLVideoElement, timestamp: number): Promise<Detection>;
}

/**
 * Detection in a Web Worker, so MediaPipe's GPU readback never stalls the main thread
 * (it was most of the frame budget there). Falls back to the main thread if the worker can't start.
 */
class WorkerDetector implements HandDetector {
  private pending: { resolve: (d: Detection) => void; reject: (e: Error) => void } | null = null;

  private constructor(private readonly worker: Worker) {
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const pending = this.pending;
      this.pending = null;
      if (event.data.type === "result") pending?.resolve(event.data.detection);
      else if (event.data.type === "error") pending?.reject(new Error(event.data.message));
    };
  }

  static async create(): Promise<WorkerDetector> {
    const worker = new Worker(new URL("./handWorker.ts", import.meta.url), { type: "module" });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Hand-tracking worker timed out")), 20_000);
      worker.onmessage = (event: MessageEvent<WorkerReply>) => {
        clearTimeout(timeout);
        if (event.data.type === "ready") resolve();
        else reject(new Error(event.data.type === "error" ? event.data.message : "Unexpected worker reply"));
      };
      worker.onerror = (event) => {
        clearTimeout(timeout);
        reject(new Error(event.message || "Hand-tracking worker failed"));
      };
    }).catch((error) => {
      worker.terminate();
      throw error;
    });
    return new WorkerDetector(worker);
  }

  async detect(video: HTMLVideoElement, timestamp: number): Promise<Detection> {
    const frame = await createImageBitmap(video);
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      this.worker.postMessage({ type: "frame", frame, timestamp } satisfies WorkerRequest, [frame]);
    });
  }
}

class MainThreadDetector implements HandDetector {
  constructor(private readonly landmarker: HandLandmarker) {}

  async detect(video: HTMLVideoElement, timestamp: number): Promise<Detection> {
    return toDetection(this.landmarker.detectForVideo(video, timestamp));
  }
}

let shared: Promise<HandDetector> | null = null;

/** The detector is created once and reused, so turning the camera off and on doesn't reload the model. */
export function getDetector(): Promise<HandDetector> {
  shared ??= createDetector();
  // Allow a retry if loading failed (e.g. offline).
  shared.catch(() => (shared = null));
  return shared;
}

/** Load the model in the background once the page is idle, so turning on gestures doesn't stall. */
export function preloadDetector(): void {
  const load = () => getDetector().catch(() => {});
  if ("requestIdleCallback" in window) requestIdleCallback(load, { timeout: 3000 });
  else setTimeout(load, 1000);
}

async function createDetector(): Promise<HandDetector> {
  if (typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined" && typeof createImageBitmap !== "undefined") {
    try {
      return await WorkerDetector.create();
    } catch (error) {
      console.warn("Hand tracking falling back to the main thread:", error);
    }
  }
  return new MainThreadDetector(await createLandmarker());
}
