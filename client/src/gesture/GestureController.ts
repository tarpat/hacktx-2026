import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { classifyPose, PoseSmoother } from "./poseClassifier";
import { DEFAULT_TIMINGS, resetGesture, stepGesture, type GestureState, type GestureTimings } from "./gestureStateMachine";
import type { GestureAction, GestureActionEvent, GestureObservation, Handedness, Landmark, TrackingStatus } from "./types";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

/** Local-only debug frame. Never send this over the network. */
export interface DebugFrame {
  landmarks: Landmark[] | null;
  fps: number;
  state: GestureState["kind"];
}

export class CameraError extends Error {}

let landmarkerPromise: Promise<HandLandmarker> | null = null;

function loadLandmarker(): Promise<HandLandmarker> {
  landmarkerPromise ??= (async () => {
    const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
    const create = (delegate: "GPU" | "CPU") =>
      HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: "VIDEO",
        numHands: 1,
      });
    try {
      return await create("GPU");
    } catch {
      return await create("CPU");
    }
  })();
  // Allow a retry if loading failed (e.g. offline).
  landmarkerPromise.catch(() => (landmarkerPromise = null));
  return landmarkerPromise;
}

function describeCameraError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError") return "Camera permission was denied. Allow camera access in the browser's address bar, then try again.";
  if (name === "NotFoundError") return "No camera was found. Plug one in and try again.";
  if (name === "NotReadableError") return "The camera is in use by another app or tab. Close it and try again.";
  return `Could not start the camera${error instanceof Error ? `: ${error.message}` : "."}`;
}

export class GestureController {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private rafId = 0;
  /** Bumped on every start/stop so a stale async start can detect it was cancelled. */
  private generation = 0;
  private lastVideoTime = -1;
  private smoother = new PoseSmoother();
  private gestureState: GestureState = { kind: "IDLE" };
  private hand: Handedness | undefined;
  private status: TrackingStatus = "CAMERA_OFF";
  private frameTimes: number[] = [];

  private actionListeners = new Set<(e: GestureActionEvent) => void>();
  private observationListeners = new Set<(e: GestureObservation) => void>();
  private debugListeners = new Set<(f: DebugFrame) => void>();

  constructor(private readonly timings: GestureTimings = DEFAULT_TIMINGS) {}

  async start(video: HTMLVideoElement): Promise<void> {
    this.stop();
    const generation = ++this.generation;
    this.setStatus("STARTING");

    try {
      if (!window.isSecureContext) throw new CameraError("The camera needs a secure page. Open the game on localhost or HTTPS.");
      if (!navigator.mediaDevices?.getUserMedia) throw new CameraError("This browser does not support camera access.");

      let stream: MediaStream;
      try {
        // Audio stays off so the audio module keeps control of the mic.
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
      } catch (error) {
        throw new CameraError(describeCameraError(error));
      }
      if (generation !== this.generation) return stopTracks(stream);
      this.stream = stream;
      this.video = video;
      stream.getVideoTracks()[0]?.addEventListener("ended", this.handleTrackEnded);
      document.addEventListener("visibilitychange", this.handleVisibilityChange);
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();

      let landmarker: HandLandmarker;
      try {
        landmarker = await loadLandmarker();
      } catch {
        throw new CameraError("Could not load the hand-tracking model. Check the network connection and try again.");
      }
      if (generation !== this.generation) return;

      this.setStatus("NO_HAND");
      this.loop(landmarker, generation);
    } catch (error) {
      if (generation !== this.generation) return;
      this.stopMedia();
      this.setStatus("ERROR");
      throw error instanceof CameraError ? error : new CameraError(describeCameraError(error));
    }
  }

  stop(): void {
    this.generation++;
    this.flushGestureState();
    this.stopMedia();
    if (this.status !== "CAMERA_OFF") this.setStatus("CAMERA_OFF");
  }

  onAction(callback: (event: GestureActionEvent) => void): () => void {
    this.actionListeners.add(callback);
    return () => this.actionListeners.delete(callback);
  }

  onObservation(callback: (event: GestureObservation) => void): () => void {
    this.observationListeners.add(callback);
    return () => this.observationListeners.delete(callback);
  }

  onDebugFrame(callback: (frame: DebugFrame) => void): () => void {
    this.debugListeners.add(callback);
    return () => this.debugListeners.delete(callback);
  }

  private loop(landmarker: HandLandmarker, generation: number) {
    const tick = () => {
      if (generation !== this.generation || !this.video) return;
      this.rafId = requestAnimationFrame(tick);
      const video = this.video;
      // Skip until metadata is ready and skip frames we've already processed.
      if (video.videoWidth === 0 || video.currentTime === this.lastVideoTime) return;
      this.lastVideoTime = video.currentTime;

      const now = performance.now();
      const result = landmarker.detectForVideo(video, now);
      const landmarks = (result.landmarks[0] as Landmark[] | undefined) ?? null;
      this.hand = result.handedness[0]?.[0]?.categoryName as Handedness | undefined;
      this.processFrame(landmarks, now);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private processFrame(landmarks: Landmark[] | null, now: number) {
    const rawPose = classifyPose(landmarks ?? undefined);
    const pose = this.smoother.push(rawPose);
    this.setStatus(landmarks ? "TRACKING" : "NO_HAND");

    const { state, actions } = stepGesture(this.gestureState, pose, now, this.timings);
    this.gestureState = state;
    this.emitActions(actions, now);

    for (const listener of this.observationListeners) {
      listener({ pose, rawPose, status: this.status, hand: this.hand, timestampMs: now });
    }

    this.frameTimes.push(now);
    while (this.frameTimes.length > 0 && now - this.frameTimes[0] > 1000) this.frameTimes.shift();
    for (const listener of this.debugListeners) {
      listener({ landmarks, fps: this.frameTimes.length, state: state.kind });
    }
  }

  private emitActions(actions: GestureAction[], now: number) {
    for (const action of actions) {
      for (const listener of this.actionListeners) listener({ action, localTimestampMs: now, hand: this.hand });
    }
  }

  /** Force SHIELD_END / CHARGE_CANCEL so the game never sees a dangling interval. */
  private flushGestureState() {
    this.emitActions(resetGesture(this.gestureState), performance.now());
    this.gestureState = { kind: "IDLE" };
    this.smoother.reset();
  }

  private handleTrackEnded = () => {
    this.generation++;
    this.flushGestureState();
    this.stopMedia();
    this.setStatus("ERROR");
  };

  private handleVisibilityChange = () => {
    // rAF pauses in background tabs; close out any held shield/charge immediately.
    if (document.hidden) this.flushGestureState();
  };

  private stopMedia() {
    cancelAnimationFrame(this.rafId);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.stream?.getVideoTracks()[0]?.removeEventListener("ended", this.handleTrackEnded);
    if (this.stream) stopTracks(this.stream);
    if (this.video) this.video.srcObject = null;
    this.stream = null;
    this.video = null;
    this.lastVideoTime = -1;
    this.frameTimes = [];
  }

  private setStatus(status: TrackingStatus) {
    if (status === this.status) return;
    this.status = status;
    for (const listener of this.observationListeners) {
      listener({ pose: "NONE", rawPose: "NONE", status, timestampMs: performance.now() });
    }
  }
}

function stopTracks(stream: MediaStream) {
  for (const track of stream.getTracks()) track.stop();
}
