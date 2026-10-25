import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ detect: vi.fn() }));
vi.mock("../src/gesture/handDetector", () => ({ getDetector: async () => ({ detect: mocks.detect }) }));
vi.mock("../src/gesture/raceFaceTracking", () => ({ loadRaceFaceTracker: async () => ({}), RaceFaceReader: class {} }));
import { GestureController } from "../src/gesture/GestureController";

const hand = (i: number) => Array.from({ length: 21 }, () => ({ x: .5+.16*Math.cos(i*Math.PI/16), y: .5+.16*Math.sin(i*Math.PI/16), z: 0 }));

describe("magic charge controller input routing", () => {
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
    video = { currentTime: 0, videoWidth: 640, play: async () => {}, srcObject: null } as unknown as HTMLVideoElement;
    controller = new GestureController();
  });
  afterEach(() => { controller.stop(); vi.unstubAllGlobals(); });
  async function frame(i: number) {
    now += 40;
    video.currentTime += 0.04;
    mocks.detect.mockResolvedValue({ landmarks: [hand(i)], handedness: ["Left"] });
    tick(now);
    await Promise.resolve();
  }
  it("scores hand circles, shows the hand skeleton, and suspends spell casting", async () => {
    const actions: string[] = [], feedback = vi.fn(), debug = vi.fn();
    controller.onAction(e => actions.push(e.action));
    controller.onCircleChargeFeedback(feedback);
    controller.onDebugFrame(debug);
    await controller.start(video);
    controller.setStruggling(true);
    for(let i=0;i<=64;i++) await frame(i);
    expect(actions).toEqual(["STRUGGLE_PUSH", "STRUGGLE_PUSH"]);
    expect(debug.mock.lastCall?.[0].hands).toHaveLength(1);
    expect(feedback.mock.lastCall?.[0].visible).toBe(true);
    controller.setStruggling(false);
    await frame(0);
    expect(actions).toEqual(["STRUGGLE_PUSH", "STRUGGLE_PUSH"]);
  });
  it("clears a partial circle when a new collision starts", async () => {
    const push=vi.fn(); controller.onAction(e=>{ if(e.action === "STRUGGLE_PUSH") push(); });
    await controller.start(video); controller.setStruggling(true);
    for(let i=0;i<=16;i++) await frame(i);
    controller.setStruggling(false); controller.setStruggling(true);
    for(let i=17;i<=32;i++) await frame(i);
    expect(push).not.toHaveBeenCalled();
    for(let i=33;i<=64;i++) await frame(i);
    expect(push).toHaveBeenCalledOnce();
  });
  it("clears progress and reports interrupted hand detection", async () => {
    const feedback=vi.fn(), actions=vi.fn(); controller.onCircleChargeFeedback(feedback); controller.onAction(actions);
    await controller.start(video); controller.setStruggling(true);
    for(let i=0;i<=16;i++) await frame(i);
    mocks.detect.mockRejectedValueOnce(new Error("Lost frame"));
    now+=40; video.currentTime+=.04; tick(now); await Promise.resolve();
    expect(feedback.mock.lastCall?.[0]).toMatchObject({visible:false, progress:0});
    expect(feedback.mock.lastCall?.[0].hint).toContain("interrupted");
    for(let i=17;i<=32;i++) await frame(i);
    expect(actions).not.toHaveBeenCalled();
  });
  it("discards a detection that resolves after leaving the challenge", async () => {
    let resolve!: (value: unknown) => void;
    const actions=vi.fn(), feedback=vi.fn(); controller.onAction(actions); controller.onCircleChargeFeedback(feedback);
    await controller.start(video); controller.setStruggling(true);
    mocks.detect.mockReturnValue(new Promise(r=>{resolve=r;}));
    video.currentTime+=.04; now+=40; tick(now);
    controller.setStruggling(false);
    resolve({landmarks:[hand(0)],handedness:["Left"]}); await Promise.resolve();
    expect(actions).not.toHaveBeenCalled(); expect(feedback).not.toHaveBeenCalled();
  });
});
