import type { FaceLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";
import { POSE_RACE, type RacePoseId } from "@spellcaster/shared";
import { loadRaceFaceTracker, RaceFaceReader } from "./raceFaceTracking";
import { matchRacePose, type PoseFeedback } from "./racePoseMatcher";
import { classifyPose, combinePoses, PoseSmoother } from "./poseClassifier";
import { getDetector, type HandDetector } from "./handDetector";
import { filterHands, HandStabilizer } from "./handTracking";
import { SixSevenCounter, type BodyLandmark, type SixSevenFeedback } from "./sixSevenCounter";
import { loadSixSevenTracker } from "./sixSevenTracking";
import { DEFAULT_TIMINGS, resetGesture, stepGesture, type GestureState, type GestureTimings } from "./gestureStateMachine";
import type { GestureAction, GestureActionEvent, GestureObservation, Handedness, HandPose, Landmark, TrackingStatus } from "./types";

/** Local-only debug frame. Never send this over the network. */
export interface DebugFrame {
  /** One entry per tracked hand (0–2). */
  hands: Landmark[][];
  body?: BodyLandmark[];
  fps: number;
  state: GestureState["kind"] | "STRUGGLE";
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
  /** 4-of-6 frame vote: a pose has to persist ~130 ms at 30 fps, which filters single-frame misreads. */
  private smoother = new PoseSmoother(6, 4);
  private stabilizer = new HandStabilizer();
  private sixSeven = new SixSevenCounter();
  private bodyTracker: PoseLandmarker | null = null;
  private bodyLoading = false;
  private bodyError = false;
  private lastBodyFrame = -Infinity;
  private sixSevenListeners = new Set<(feedback: SixSevenFeedback) => void>();
  /** Invalidates in-flight hand detections when the input mode changes. */
  private inputEpoch = 0;
  /** During a spell struggle, forearm lifts push instead of casting. */
  private struggling = false;
  private raceTarget: RacePoseId | null = null;
  private faceTracker: FaceLandmarker | null = null;
  private faceReader: RaceFaceReader | null = null;
  private faceLoading = false;
  private faceError = false;
  private lastRaceFrame = 0;
  private raceListeners = new Set<(feedback: PoseFeedback) => void>();
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
      this.prepareBodyTracker();

      this.setStatus("NO_HAND");
      this.loop(detector, generation);
    } catch (error) {
      if (generation !== this.generation) return;
      this.stopMedia();
      this.setStatus("ERROR");
      throw error instanceof CameraError ? error : new CameraError(describeCameraError(error));
    }
  }

  /** Switch between casting and the 6–7 collision challenge. */
  setStruggling(on: boolean): void {
    if (on === this.struggling) return;
    this.struggling = on;
    if (on && this.video && !this.raceTarget) this.prepareBodyTracker();
    // Entering: drop any half-made gesture. Leaving: wait for hands to relax before casting again.
    this.flushGestureState();
    if (!on) this.gestureState = { kind: "REARM", blockedPoses: ["FIST", "BOTH_FISTS", "OPEN_PALM", "BOTH_PALMS", "POINT"] };
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

  onSixSevenFeedback(callback: (feedback: SixSevenFeedback) => void): () => void {
    this.sixSevenListeners.add(callback);
    return () => this.sixSevenListeners.delete(callback);
  }

  retryBodyTracking(): void {
    this.bodyError = false;
    this.sixSeven.reset();
    this.prepareBodyTracker();
  }

  private prepareBodyTracker(): void {
    if (this.bodyTracker || this.bodyLoading || this.bodyError) return;
    this.bodyLoading = true;
    loadSixSevenTracker().then((tracker) => { this.bodyTracker = tracker; }).catch(() => { this.bodyError = true; }).finally(() => { this.bodyLoading = false; });
  }

  private prepareFaceTracker(): void {
    if (this.faceTracker || this.faceLoading || this.faceError) return;
    this.faceLoading = true;
    loadRaceFaceTracker().then((tracker) => { this.faceTracker = tracker; }).catch(() => { this.faceError = true; }).finally(() => { this.faceLoading = false; });
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

  private loop(detector: HandDetector, generation: number) {
    let busy = false;
    const tick = () => {
      if (generation !== this.generation || !this.video) return;
      this.rafId = requestAnimationFrame(tick);
      const video = this.video;
      // Skip until metadata is ready, skip frames we've already processed, and keep one frame in flight.
      if (busy || video.videoWidth === 0 || video.currentTime === this.lastVideoTime) return;
      this.lastVideoTime = video.currentTime;

      const now = performance.now();
      // Pose inference replaces hand inference in this mode. Cap it at 20 Hz so
      // the lightweight model leaves room for the arena and the camera preview.
      if (this.struggling && !this.raceTarget) {
        if (now - this.lastBodyFrame >= 50 && !document.hidden) {
          this.lastBodyFrame = now;
          this.processBodyFrame(video, now);
        }
        return;
      }
      const epoch = this.inputEpoch;
      busy = true;
      detector.detect(video, now).then(
        ({ landmarks: raw, handedness }) => {
          busy = false;
          if (generation !== this.generation || epoch !== this.inputEpoch || document.hidden) return;
          const hands = this.stabilizer.update(filterHands(raw), now);
          // Handedness is only meaningful for one-hand gestures.
          this.hand = hands.length === 1 && raw.length === 1 ? handedness[0] : undefined;
          this.processFrame(hands, now);
        },
        () => {
          busy = false;
        },
      );
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private processBodyFrame(video: HTMLVideoElement, now: number): void {
    let points: BodyLandmark[] = [];
    let interrupted = false;
    let hint = this.bodyError ? "6–7 tracking unavailable. Retry tracking or use SPACE / tap." : "Loading 6–7 tracking… Use SPACE / tap while you wait.";
    if (this.bodyTracker) {
      try {
        points = this.bodyTracker.detectForVideo(video, now).landmarks[0] ?? [];
      } catch {
        interrupted = true;
        hint = "Tracking interrupted. Keep elbows in view or use SPACE / tap.";
      }
    }
    const feedback = this.sixSeven.update(points, now);
    if (this.bodyTracker && !interrupted) hint = feedback.hint;
    this.setStatus(feedback.visible ? "TRACKING" : "NO_HAND");
    this.hand = undefined;
    for (const listener of this.sixSevenListeners) listener({ ...feedback, hint });
    if (feedback.push) this.emitActions(["STRUGGLE_PUSH"], now);
    this.notify("NONE", "NONE", [], now, points);
  }

  private processFrame(hands: Landmark[][], now: number) {
    const rawPose = combinePoses(hands.map(classifyPose));
    const pose = this.smoother.push(rawPose);
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
    if (this.struggling) {
      this.notify(pose, rawPose, hands, now);
      return;
    }

    const { state, actions } = stepGesture(this.gestureState, pose, now, this.timings);
    this.gestureState = state;
    this.emitActions(actions, now);
    this.notify(pose, rawPose, hands, now);
  }

  private notify(pose: HandPose, rawPose: HandPose, hands: Landmark[][], now: number, body?: BodyLandmark[]) {
    for (const listener of this.observationListeners) {
      listener({ pose, rawPose, status: this.status, hand: this.hand, timestampMs: now });
    }

    this.frameTimes.push(now);
    while (this.frameTimes.length > 0 && now - this.frameTimes[0] > 1000) this.frameTimes.shift();
    for (const listener of this.debugListeners) {
      listener({ hands, body, fps: this.frameTimes.length, state: this.struggling ? "STRUGGLE" : this.gestureState.kind });
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
    this.sixSeven.reset();
    this.lastBodyFrame = -Infinity;
    this.emitActions(resetGesture(this.gestureState), performance.now());
    this.gestureState = { kind: "IDLE" };
    this.smoother.reset();
    this.stabilizer.reset();
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
