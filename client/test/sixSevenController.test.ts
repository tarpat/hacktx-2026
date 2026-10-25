import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ detect: vi.fn(), detectBody: vi.fn(), loadBody: vi.fn() }));
vi.mock("../src/gesture/handDetector", () => ({ getDetector: async () => ({ detect: mocks.detect }) }));
vi.mock("../src/gesture/sixSevenTracking", () => ({ loadSixSevenTracker: mocks.loadBody }));
vi.mock("../src/gesture/raceFaceTracking", () => ({ loadRaceFaceTracker: async () => ({}), RaceFaceReader: class {} }));
import { GestureController } from "../src/gesture/GestureController";

const pose = (up: boolean) => {
  const points = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
  points[13].y = points[14].y = 0.55;
  points[15].y = up ? 0.4 : 0.7; points[16].y = 0.7;
  return points;
};

describe("6–7 controller input routing", () => {
  let now: number;
  let tick: FrameRequestCallback;
  let controller: GestureController;
  let video: HTMLVideoElement;
  const stop = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    now = 0;
    vi.stubGlobal("window", { isSecureContext: true });
    vi.stubGlobal("document", { hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: async () => ({ getVideoTracks: () => [{ addEventListener: vi.fn(), removeEventListener: vi.fn() }], getTracks: () => [{ stop }] }) } });
    vi.stubGlobal("performance", { now: () => now });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { tick = callback; return 1; });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    mocks.detect.mockResolvedValue({ landmarks: [], handedness: [] });
    mocks.loadBody.mockResolvedValue({ detectForVideo: mocks.detectBody });
    video = { currentTime: 0, videoWidth: 640, play: async () => {}, srcObject: null } as unknown as HTMLVideoElement;
    controller = new GestureController();
  });
  afterEach(() => { controller.stop(); vi.unstubAllGlobals(); });
  async function frame(up: boolean) {
    now += 50;
    video.currentTime += 0.05;
    mocks.detectBody.mockReturnValue({ landmarks: [pose(up)] });
    tick(now);
    await Promise.resolve();
  }
  async function beat() { await frame(false); await frame(false); await frame(true); await frame(true); }

  it("preloads pose tracking and replaces hand casting with confirmed body lifts", async () => {
    const actions: string[] = [];
    controller.onAction((e) => actions.push(e.action));
    await controller.start(video);
    expect(mocks.loadBody).toHaveBeenCalledOnce();
    controller.setStruggling(true);
    await beat(); await beat();
    expect(actions).toEqual(["STRUGGLE_PUSH", "STRUGGLE_PUSH"]);
    expect(mocks.detect).not.toHaveBeenCalled();
    controller.setStruggling(false);
    await frame(true);
    expect(mocks.detect).toHaveBeenCalledOnce();
    expect(actions).toEqual(["STRUGGLE_PUSH", "STRUGGLE_PUSH"]);
  });

  it("clears the motion baseline when a new collision or camera session starts", async () => {
    const push = vi.fn();
    controller.onAction((e) => { if (e.action === "STRUGGLE_PUSH") push(); });
    await controller.start(video);
    controller.setStruggling(true);
    await frame(false); await frame(false);
    controller.setStruggling(false); controller.setStruggling(true);
    await frame(true); await frame(true);
    expect(push).not.toHaveBeenCalled();
    await controller.start(video);
    await frame(true); await frame(true);
    expect(push).not.toHaveBeenCalled();
    await beat();
    expect(push).toHaveBeenCalledOnce();
  });

  it("reports model failures and supports a retry without emitting phantom pushes", async () => {
    mocks.loadBody.mockRejectedValueOnce(new Error("Offline"));
    const feedback = vi.fn(), actions = vi.fn();
    controller.onSixSevenFeedback(feedback); controller.onAction(actions);
    controller.setStruggling(true);
    await controller.start(video);
    await Promise.resolve(); await Promise.resolve();
    await frame(true);
    expect(feedback.mock.lastCall?.[0].hint).toContain("unavailable");
    controller.retryBodyTracking();
    await Promise.resolve();
    await beat();
    expect(actions).toHaveBeenCalledOnce();
    expect(actions.mock.lastCall?.[0].action).toBe("STRUGGLE_PUSH");
  });
});
