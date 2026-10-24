import { test } from "node:test";
import assert from "node:assert/strict";
import { AudioPlayer } from "../../src/audio/player.ts";
import type { AudioBackend, Sound, Voice } from "../../src/audio/backend.ts";

class FakeBackend implements AudioBackend {
  loads: string[] = [];
  voices: (Voice & { volume: number; stopped: boolean; finish(): void })[] = [];
  unlocks = 0;
  disposed = 0;
  failUnlock = false;
  failLoad = false;
  failPlay = false;
  pending: Promise<void> = Promise.resolve();
  async unlock() { this.unlocks++; if (this.failUnlock) throw new Error("blocked"); }
  async load(url: string): Promise<Sound> {
    this.loads.push(url);
    await this.pending;
    if (this.failLoad) throw new Error("404 or decode failure");
    return { play: (volume, ended) => {
      if (this.failPlay) throw new Error("suspended");
      const voice = {
        volume, stopped: false,
        setVolume(value: number) { this.volume = value; },
        stop() { this.stopped = true; ended(); },
        finish() { ended(); },
      };
      this.voices.push(voice);
      return voice;
    } };
  }
  dispose() { this.disposed++; }
}

function setup(maxVoices = 8) {
  const backend = new FakeBackend();
  const player = new AudioPlayer({ backend, maxVoices });
  return { backend, player };
}

test("does not load, unlock or play before explicit enable", async () => {
  const { player, backend } = setup();
  assert.equal(await player.play("cast"), "disabled");
  assert.equal(await player.preload(), false);
  assert.equal(backend.unlocks, 0);
  assert.deepEqual(backend.loads, []);
});

test("blocked enable is recoverable and concurrent enable calls share one attempt", async () => {
  const { player, backend } = setup();
  backend.failUnlock = true;
  assert.deepEqual(await Promise.all([player.enable(), player.enable()]), [false, false]);
  assert.equal(backend.unlocks, 1);
  assert.match(player.getSnapshot().error!, /retry/);
  backend.failUnlock = false;
  assert.equal(await player.enable(), true);
  assert.equal(player.getSnapshot().error, null);
});

test("caches loads while allowing independent overlapping voices", async () => {
  const { player, backend } = setup();
  await player.enable();
  assert.deepEqual(await Promise.all([player.play("cast"), player.play("cast")]), ["played", "played"]);
  assert.deepEqual(backend.loads, ["/audio/cast.wav"]);
  assert.equal(backend.voices.length, 2);
  assert.equal(player.getSnapshot().activeVoices, 2);
  backend.voices[0].finish();
  assert.equal(player.getSnapshot().activeVoices, 1);
});

test("limits overlapping voices and releases capacity on completion", async () => {
  const { player, backend } = setup(2);
  await player.enable();
  assert.deepEqual(await Promise.all([player.play("cast"), player.play("hit"), player.play("block")]), ["played", "played", "limited"]);
  backend.voices[0].finish();
  assert.equal(await player.play("block"), "played");
});

test("mute immediately silences active sounds, suppresses new ones and restores gain", async () => {
  const { player, backend } = setup();
  await player.enable();
  await player.play("cast");
  player.setMuted(true);
  assert.equal(backend.voices[0].volume, 0);
  assert.equal(await player.play("hit"), "muted");
  player.setVolume(0.5);
  assert.equal(backend.voices[0].volume, 0);
  player.setMuted(false);
  assert.equal(backend.voices[0].volume, 0.5 * 0.65);
});

test("volume clamps, ignores nonfinite values, and zero suppresses new sounds", async () => {
  const { player } = setup();
  await player.enable();
  player.setVolume(2); assert.equal(player.getSnapshot().volume, 1);
  player.setVolume(NaN); assert.equal(player.getSnapshot().volume, 1);
  player.setVolume(-1); assert.equal(await player.play("cast"), "muted");
});

test("failed asset loading is reported and retried without poisoning other cues", async () => {
  const { player, backend } = setup();
  await player.enable();
  backend.failLoad = true;
  assert.equal(await player.play("cast"), "failed");
  assert.match(player.getSnapshot().error!, /Could not play/);
  backend.failLoad = false;
  assert.equal(await player.play("cast"), "played");
  assert.equal(await player.play("hit"), "played");
  assert.equal(backend.loads.length, 3);
  assert.equal(player.getSnapshot().error, null);
});

test("playback rejection never escapes into gameplay", async () => {
  const { player, backend } = setup();
  await player.enable();
  backend.failPlay = true;
  assert.equal(await player.play("cast"), "failed");
  assert.equal(player.getSnapshot().activeVoices, 0);
});

test("preloads six cues, deduplicates concurrent loads, supports deployment base path", async () => {
  const backend = new FakeBackend();
  const player = new AudioPlayer({ backend, baseUrl: "/duel/audio/" });
  await player.enable();
  assert.deepEqual(await Promise.all([player.preload(), player.preload()]), [true, true]);
  assert.equal(backend.loads.length, 6);
  assert.ok(backend.loads.every((url) => url.startsWith("/duel/audio/")));
});

test("preload failure is contained and retry succeeds", async () => {
  const { player, backend } = setup();
  await player.enable();
  backend.failLoad = true;
  assert.equal(await player.preload(), false);
  backend.failLoad = false;
  assert.equal(await player.preload(), true);
});

test("stop cancels in-flight loading and future playback still works", async () => {
  const { player, backend } = setup();
  await player.enable();
  let release!: () => void;
  backend.pending = new Promise((resolve) => { release = resolve; });
  const pending = player.play("cast");
  player.stopAll();
  release();
  assert.equal(await pending, "cancelled");
  assert.equal(backend.voices.length, 0);
  assert.equal(await player.play("cast"), "played");
});

test("muting during loading suppresses playback when loading completes", async () => {
  const { player, backend } = setup();
  await player.enable();
  const pending = player.play("cast");
  player.setMuted(true);
  assert.equal(await pending, "muted");
  assert.equal(backend.voices.length, 0);
});

test("stop and dispose clean active voices and are safe to repeat", async () => {
  const { player, backend } = setup();
  await player.enable();
  await player.play("victory");
  player.stopAll();
  assert.equal(backend.voices[0].stopped, true);
  assert.equal(player.getSnapshot().activeVoices, 0);
  await player.play("cast");
  player.dispose(); player.dispose(); player.stopAll();
  assert.ok(backend.voices.every((voice) => voice.stopped));
  assert.equal(backend.disposed, 1);
  assert.equal(await player.enable(), false);
  assert.equal(await player.play("cast"), "disabled");
});

test("disposal during loading prevents late playback", async () => {
  const { player, backend } = setup();
  await player.enable();
  const pending = player.play("cast");
  player.dispose();
  assert.equal(await pending, "cancelled");
});

test("subscriptions can be removed", () => {
  const { player } = setup();
  let calls = 0;
  const unsubscribe = player.subscribe(() => calls++);
  player.setVolume(0.3);
  unsubscribe();
  player.setVolume(0.5);
  assert.equal(calls, 1);
});
