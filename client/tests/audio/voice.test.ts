import { test } from "node:test";
import assert from "node:assert/strict";
import { spellFromTranscript, spellsFromTranscript } from "../../src/voice/commands.ts";
import { VoiceCaster, type Recognition } from "../../src/voice/recognition.ts";
import type { SpellId } from "@spellcaster/shared";

class FakeRecognition implements Recognition {
  lang = ""; continuous = false; interimResults = false; maxAlternatives = 0;
  processLocally = false; phrases: unknown[] = [];
  onstart: Recognition["onstart"] = null;
  onend: Recognition["onend"] = null;
  onerror: Recognition["onerror"] = null;
  onresult: Recognition["onresult"] = null;
  starts = 0; aborts = 0;
  start() { this.starts++; this.onstart?.(); }
  abort() { this.aborts++; }
  result(transcript: string, isFinal = false, index = 0) {
    const results = Array.from({ length: index + 1 }, () => ({ isFinal: true, 0: { transcript: "" } }));
    results[index] = { isFinal, 0: { transcript } };
    this.onresult?.({ resultIndex: index, results });
  }
}

function setup(options: { local?: boolean; prepare?: () => Promise<void> } = {}) {
  const instances: FakeRecognition[] = [];
  const casts: SpellId[] = [];
  let active = true;
  let now = 0;
  let prepares = 0;
  let checks = 0;
  const caster = new VoiceCaster({
    factory: () => { const rec = new FakeRecognition(); instances.push(rec); return rec; },
    prepareMicrophone: async () => { prepares++; await options.prepare?.(); },
    localAvailable: async () => { checks++; return options.local ?? false; },
    hints: () => ["incendio", "protego", "glacius", "fulmen"],
    onCast: (spell) => casts.push(spell), isActive: () => active, now: () => now,
  });
  return { caster, casts, instances, prepares: () => prepares, checks: () => checks,
    setActive: (value: boolean) => { active = value; }, advance: (ms: number) => { now += ms; } };
}

test("only the four incantations map to spells; ordinary names and conversation are ignored", () => {
  assert.equal(spellFromTranscript("INCENDIO!"), "fireball");
  assert.equal(spellFromTranscript("cast Protego."), "shield");
  assert.equal(spellFromTranscript("glacius"), "ice");
  assert.equal(spellFromTranscript("fulmen"), "ultimate");
  assert.deepEqual(spellsFromTranscript("incendio, protego glacius fulmen"), ["fireball", "shield", "ice", "ultimate"]);
  for (const text of ["fireball", "shield", "ice", "ultimate", "don't incendio", "I said protego", "incendios", "", "__proto__"]) assert.deepEqual(spellsFromTranscript(text), []);
});

test("starts continuous interim recognition once; prefers an already-installed local model", async () => {
  const { caster, instances, prepares } = setup({ local: true });
  const first = caster.start(); const second = caster.start();
  await Promise.all([first, second]);
  assert.equal(instances.length, 1);
  assert.equal(prepares(), 1);
  assert.equal(instances[0].continuous, true);
  assert.equal(instances[0].interimResults, true);
  assert.equal(instances[0].processLocally, true);
  assert.deepEqual(instances[0].phrases, ["incendio", "protego", "glacius", "fulmen"]);
  caster.dispose();
});

test("automatic mode uses the browser service immediately when no local model is installed", async () => {
  const { caster, instances } = setup();
  await caster.start();
  assert.equal(instances[0].processLocally, false);
  assert.equal(caster.getSnapshot().processing, "browser");
  caster.dispose();
});

test("interim incantation dispatches synchronously; a final delayed ten seconds cannot fire it twice", async () => {
  const { caster, instances, casts, advance } = setup();
  await caster.start();
  instances[0].result("incendio");
  assert.deepEqual(casts, ["fireball"]); // No timers or final-result await.
  assert.equal(caster.getSnapshot().lastDispatchMs, 0);
  advance(10_000);
  instances[0].result("incendio"); instances[0].result("incendio", true); instances[0].result("incendio", true);
  assert.deepEqual(casts, ["fireball"]);
  assert.equal(instances[0].aborts, 0);
  caster.dispose();
});

test("growing interim transcripts dispatch only newly spoken positions, not revised guesses", async () => {
  const { caster, instances, casts } = setup();
  await caster.start();
  instances[0].result("incendio");
  instances[0].result("glacius"); // Same acoustic position revised: don't cast a second spell.
  instances[0].result("incendio protego");
  instances[0].result("incendio protego", true);
  instances[0].result("glacius", true, 1);
  assert.deepEqual(casts, ["fireball", "shield", "ice"]);
  caster.dispose();
});

test("distinct utterances can recast; short repeat bursts cannot spam requests", async () => {
  const { caster, instances, casts, advance } = setup();
  await caster.start();
  instances[0].result("incendio", true, 0);
  instances[0].result("incendio", true, 1);
  instances[0].result("protego", true, 2);
  advance(3_000);
  instances[0].result("incendio", true, 3);
  assert.deepEqual(casts, ["fireball", "shield", "fireball"]);
  caster.dispose();
});

test("countdown warms the microphone but consumed countdown speech cannot cast after start", async () => {
  const { caster, setActive, instances, casts } = setup();
  setActive(false); await caster.start();
  assert.equal(instances.length, 1);
  instances[0].result("incendio");
  setActive(true); instances[0].result("incendio", true);
  instances[0].result("protego", true, 1);
  assert.deepEqual(casts, ["shield"]);
  caster.dispose();
});

test("unknown speech remains text without casting; final-only providers still work", async () => {
  const { caster, instances, casts } = setup();
  await caster.start();
  instances[0].result("do not incendio", true);
  assert.equal(caster.getSnapshot().transcript, "do not incendio");
  instances[0].result("fulmen", true, 1);
  assert.deepEqual(casts, ["ultimate"]);
  caster.dispose();
});

test("natural end automatically restarts without requesting permissions or checking models again", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { caster, instances, prepares, checks } = setup();
  await caster.start();
  const late = instances[0].onresult!;
  instances[0].onend!();
  assert.equal(caster.getSnapshot().status, "reconnecting");
  t.mock.timers.tick(100);
  assert.equal(instances.length, 2);
  assert.equal(prepares(), 1); assert.equal(checks(), 1);
  late({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "incendio" } }] });
  assert.equal(caster.getSnapshot().requestedSpell, null);
  caster.dispose();
});

test("stop cancels queued restarts, while pause/resume preserves user choice", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { caster, instances } = setup();
  await caster.start(); caster.pause();
  assert.equal(instances[0].aborts, 1);
  caster.resume(); assert.equal(instances.length, 2);
  instances[1].onend!(); caster.stop();
  t.mock.timers.tick(10_000); caster.resume();
  assert.equal(instances.length, 2);
  assert.equal(caster.getSnapshot().enabled, false);
  caster.dispose();
});

test("permission denial never loops, and Stop during the pending permission promise prevents start", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const denied = setup({ prepare: async () => { throw new DOMException("denied", "NotAllowedError"); } });
  await denied.caster.start(); t.mock.timers.tick(10_000);
  assert.equal(denied.prepares(), 1); assert.equal(denied.instances.length, 0);
  assert.match(denied.caster.getSnapshot().message, /denied/);
  let grant!: () => void;
  const pending = setup({ prepare: () => new Promise((resolve) => { grant = resolve; }) });
  const start = pending.caster.start(); pending.caster.stop(); grant(); await start;
  assert.equal(pending.instances.length, 0);
  denied.caster.dispose(); pending.caster.dispose();
});

test("network errors back off and stop after three retries; permission errors stop immediately", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { caster, instances } = setup();
  await caster.start();
  for (const delay of [250, 500, 1_000]) {
    instances.at(-1)!.onerror!({ error: "network" }); t.mock.timers.tick(delay);
  }
  assert.equal(instances.length, 4);
  instances[3].onerror!({ error: "network" }); t.mock.timers.tick(10_000);
  assert.equal(instances.length, 4); assert.equal(caster.getSnapshot().enabled, false);
  await caster.start(); instances[4].onerror!({ error: "not-allowed" }); t.mock.timers.tick(10_000);
  assert.equal(instances.length, 5);
  caster.dispose();
});

test("unavailable local engine automatically falls back once; unsupported browsers stay readable", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { caster, instances } = setup({ local: true });
  await caster.start(); instances[0].onerror!({ error: "language-not-supported" });
  t.mock.timers.tick(100);
  assert.equal(instances[1].processLocally, false);
  caster.dispose();
  const unsupported = new VoiceCaster({ factory: null, onCast() {}, isActive: () => true });
  await unsupported.start(); unsupported.pause(); unsupported.stop();
  assert.match(unsupported.getSnapshot().message, /unavailable/);
});

test("disposal during a pending start prevents microphone recognition and callbacks", async () => {
  let grant!: () => void;
  const { caster, instances, casts } = setup({ prepare: () => new Promise((resolve) => { grant = resolve; }) });
  const start = caster.start(); caster.dispose(); grant(); await start;
  assert.equal(instances.length, 0); assert.deepEqual(casts, []);
});
