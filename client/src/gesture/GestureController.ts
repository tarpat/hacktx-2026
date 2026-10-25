import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { POSE_RACE, type RacePoseId } from "@spellcaster/shared";
import { loadRaceFaceTracker, RaceFaceReader } from "./raceFaceTracking";
import { matchRacePose, type PoseFeedback } from "./racePoseMatcher";
import { getDetector, type HandDetector } from "./handDetector";
import { CircleChargeCounter, type CircleChargeFeedback } from "./circleChargeCounter";
import { GesturePipeline, type PipelineFrame } from "./gesturePipeline";
import { DEFAULT_TIMINGS, type GestureState, type GestureTimings } from "./gestureStateMachine";
import type { GestureAction, GestureActionEvent, GestureObservation, Handedness, HandPose, Landmark, TrackingStatus } from "./types";

/** Local-only debug frame. Never send this over the network. */
export interface DebugFrame {
  /** One entry per tracked hand (0–2). */
  hands: Landmark[][];
  fps: number;
  state: GestureState["kind"] | "STRUGGLE";
}

/** Unfiltered landmarker output for one frame, as recorded by the gesture test page. Local only. */
export interface RawDetection {
  timestampMs: number;
  landmarks: Landmark[][];
  handedness: (Handedness | undefined)[];
}

export class CameraError extends Error {}

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
  private circleCharge = new CircleChargeCounter();
  private circleChargeListeners = new Set<(feedback: CircleChargeFeedback) => void>();
  /** Invalidates in-flight hand detections when the input mode changes. */
  private inputEpoch = 0;
  /** During a spell struggle, hand circles push instead of casting. */
  private struggling = false;
  private pipeline: GesturePipeline;
  private raceTarget: RacePoseId | null = null;
  private faceTracker: FaceLandmarker | null = null;
  private faceLoad: Promise<void> = Promise.resolve();
  private faceReader: RaceFaceReader | null = null;
  private faceLoading = false;
  private faceError = false;
  private lastRaceFrame = 0;
  private raceListeners = new Set<(feedback: PoseFeedback) => void>();
  private hand: Handedness | undefined;
  private status: TrackingStatus = "CAMERA_OFF";
  private frameTimes: number[] = [];

  private actionListeners = new Set<(e: GestureActionEvent) => void>();
  private observationListeners = new Set<(e: GestureObservation) => void>();
  private debugListeners = new Set<(f: DebugFrame) => void>();
  private detectionListeners = new Set<(d: RawDetection) => void>();

  constructor(timings: GestureTimings = DEFAULT_TIMINGS) {
    this.pipeline = new GesturePipeline(timings);
  }

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
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
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

      let detector: HandDetector;
      try {
        detector = await getDetector();
      } catch {
        throw new CameraError("Could not load the hand-tracking model. Check the network connection and try again.");
      }
      if (generation !== this.generation) return;

      // Preload alongside normal play so a collision does not wait for the face model.
      this.prepareFaceTracker();

      this.setStatus("NO_HAND");
      this.loop(detector, generation);
    } catch (error) {
      if (generation !== this.generation) return;
      this.stopMedia();
      this.setStatus("ERROR");
      throw error instanceof CameraError ? error : new CameraError(describeCameraError(error));
    }
  }

  /** Switch between casting and the Charge your magic challenge. */
  setStruggling(on: boolean): void {
    if (on === this.struggling) return;
    this.struggling = on;
    this.inputEpoch++;
    this.circleCharge.reset();
    this.emitActions(this.pipeline.setStruggling(on), performance.now());
  }

  setRaceTarget(target: RacePoseId | null): void {
    if (target === this.raceTarget) return;
    this.raceTarget = target;
    this.flushGestureState();
    this.lastRaceFrame = 0;
    if (target) this.prepareFaceTracker();
  }

  retryFaceTracking(): void {
    this.faceError = false;
    this.prepareFaceTracker();
  }

  onRaceFeedback(callback: (feedback: PoseFeedback) => void): () => void {
    this.raceListeners.add(callback);
    return () => this.raceListeners.delete(callback);
  }

  onCircleChargeFeedback(callback: (feedback: CircleChargeFeedback) => void): () => void {
    this.circleChargeListeners.add(callback);
    return () => this.circleChargeListeners.delete(callback);
  }

  resetCircleTracking(): void {
    this.circleCharge.reset();
  }

  private prepareFaceTracker(): void {
    if (this.faceTracker || this.faceLoading || this.faceError) return;
    this.faceLoading = true;
    this.faceLoad = loadRaceFaceTracker().then((tracker) => { this.faceTracker = tracker; }).catch(() => { this.faceError = true; }).finally(() => { this.faceLoading = false; });
  }

  /** Resolves once the preloaded face model have finished (or failed) loading; loading them stalls the page. */
  whenWarm(): Promise<void> {
    return Promise.allSettled([this.faceLoad]).then(() => undefined);
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

  onDetection(callback: (detection: RawDetection) => void): () => void {
    this.detectionListeners.add(callback);
    return () => this.detectionListeners.delete(callback);
  }

  private loop(detector: HandDetector, generation: number) {
    let busy = false;
    const tick = () => {
      if (generation !== this.generation || !this.video) return;
      this.rafId = requestAnimationFrame(tick);
      const video = this.video;
      if (busy || video.videoWidth === 0 || video.currentTime === this.lastVideoTime || document.hidden) return;
      this.lastVideoTime = video.currentTime;
      const now = performance.now();
      const epoch = this.inputEpoch;
      busy = true;
      detector.detect(video, now).then(
        ({ landmarks: raw, handedness }) => {
          busy = false;
          if (generation !== this.generation || epoch !== this.inputEpoch || document.hidden) return;
          if (this.struggling && !this.raceTarget) {
            const feedback = this.circleCharge.update(raw, now);
            this.setStatus(feedback.visible ? "TRACKING" : "NO_HAND");
            this.hand = undefined;
            for (const listener of this.circleChargeListeners) listener(feedback);
            this.notify("NONE", "NONE", raw, now);
            return;
          }
          for (const listener of this.detectionListeners) listener({ timestampMs: now, landmarks: raw, handedness });
          this.processFrame(this.pipeline.step(raw, handedness, now, !this.raceTarget), now);
        },
        () => {
          busy = false;
          if (generation !== this.generation || epoch !== this.inputEpoch || document.hidden) return;
          if (this.struggling && !this.raceTarget) {
            this.setStatus("NO_HAND");
            const feedback=this.circleCharge.update([],now);
            for (const listener of this.circleChargeListeners) listener(feedback);
            this.notify("NONE", "NONE", [], now);
          }
        },
      );
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private processFrame({ hands, pose, rawPose, hand, actions }: PipelineFrame, now: number) {
    this.hand = hand;
    this.setStatus(hands.length > 0 ? "TRACKING" : "NO_HAND");

    if (this.raceTarget) {
      if (now - this.lastRaceFrame >= POSE_RACE.sampleIntervalMs) {
        this.lastRaceFrame = now;
        let feedback: PoseFeedback = { matched: null, hint: this.faceError ? "Face tracking failed to load. Open Options to retry." : "Loading face tracking…" };
        if (this.faceTracker && this.video && !document.hidden) {
          try {
            this.faceReader ??= new RaceFaceReader();
            feedback = matchRacePose(this.raceTarget, this.faceReader.read(this.faceTracker, this.video, hands, now));
          } catch {
            feedback = { matched: null, hint: "Face tracking interrupted. Keep your face in view or retry in Options." };
          }
        }
        for (const listener of this.raceListeners) listener(feedback);
      }
      this.notify(pose, rawPose, hands, now);
      return;
    }
    this.emitActions(actions, now);
    this.notify(pose, rawPose, hands, now);
  }

  private notify(pose: HandPose, rawPose: HandPose, hands: Landmark[][], now: number) {
    for (const listener of this.observationListeners) {
      listener({ pose, rawPose, status: this.status, hand: this.hand, timestampMs: now });
    }

    this.frameTimes.push(now);
    while (this.frameTimes.length > 0 && now - this.frameTimes[0] > 1000) this.frameTimes.shift();
    for (const listener of this.debugListeners) {
      listener({ hands, fps: this.frameTimes.length, state: this.pipeline.stateKind });
    }
  }

  private emitActions(actions: GestureAction[], now: number) {
    for (const action of actions) {
      for (const listener of this.actionListeners) listener({ action, localTimestampMs: now, hand: this.hand });
    }
  }

  /** Force CHARGE_CANCEL so the game never shows a dangling charge. */
  private flushGestureState() {
    this.inputEpoch++;
    this.circleCharge.reset();
    this.emitActions(this.pipeline.reset(), performance.now());
  }

  private handleTrackEnded = () => {
    this.generation++;
    this.flushGestureState();
    this.stopMedia();
    this.setStatus("ERROR");
  };

  private handleVisibilityChange = () => {
    // rAF pauses in background tabs; close out any charge immediately.
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
