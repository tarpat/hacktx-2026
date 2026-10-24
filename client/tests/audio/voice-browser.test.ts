import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareMicrophone, speechEnvironment } from "../../src/voice/browser.ts";

test("local-model availability cannot hold startup longer than 250 ms", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    SpeechRecognition: class { static available() { return new Promise(() => {}); } },
  } });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, "window", descriptor); else Reflect.deleteProperty(globalThis, "window"); });
  const pending = speechEnvironment().localAvailable();
  t.mock.timers.tick(250);
  assert.equal(await pending, false);
});

test("parallel microphone preparations share one permission request and release all tracks", async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  let grant!: (value: unknown) => void;
  let requests = 0;
  let stops = 0;
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: {
    getUserMedia(options: { video: boolean }) {
      assert.equal(options.video, false); requests++;
      return new Promise((resolve) => { grant = resolve; });
    },
  } } });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor); else Reflect.deleteProperty(globalThis, "navigator"); });
  const one = prepareMicrophone(); const two = prepareMicrophone();
  assert.equal(one, two); assert.equal(requests, 1);
  grant({ getTracks: () => [{ stop() { stops++; } }, { stop() { stops++; } }] });
  await Promise.all([one, two]);
  assert.equal(stops, 2);
});
