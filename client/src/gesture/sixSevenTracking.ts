import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

let pending: Promise<PoseLandmarker> | null = null;

/** Preloaded during camera startup; inference runs only during the 6–7 challenge. */
export function loadSixSevenTracker(): Promise<PoseLandmarker> {
  pending ??= (async () => {
    const asset = (path: string) => new URL(`${import.meta.env.BASE_URL}${path}`, self.location.href).href;
    const vision = await FilesetResolver.forVisionTasks(asset("mediapipe/wasm"));
    const create = (delegate: "GPU" | "CPU") => PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: asset("models/pose_landmarker_lite.task"), delegate },
      runningMode: "VIDEO", numPoses: 1,
      minPoseDetectionConfidence: 0.6, minPosePresenceConfidence: 0.6, minTrackingConfidence: 0.6,
      outputSegmentationMasks: false,
    });
    try { return await create("GPU"); } catch { return await create("CPU"); }
  })();
  pending.catch(() => { pending = null; });
  return pending;
}
