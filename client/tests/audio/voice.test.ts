import { test } from "node:test";
import assert from "node:assert/strict";
import { spellFromTranscript } from "../../src/voice/commands.ts";
import { VoiceCaster, type Recognition, type SpeechResultEvent } from "../../src/voice/recognition.ts";
import type { SpellId } from "@spellcaster/shared";

class FakeRecognition implements Recognition {
  lang = ""; continuous = true; interimResults = false; maxAlternatives = 0;
  processLocally = false;
  onstart: Recognition["onstart"] = null;
  onend: Recognition["onend"] = null;
  onerror: Recognition["onerror"] = null;
  onresult: Recognition["onresult"] = null;
  starts = 0; aborts = 0; fail = false;
  start() { this.starts++; if (this.fail) throw new Error("denied"); this.onstart?.(); }
  abort() { this.aborts++; }
  result(transcript: string, isFinal = true) {
    this.onresult?.({ resultIndex: 0, results: [{ isFinal, 0: { transcript } }] });
  }
}
function setup() {
  const instances: FakeRecognition[] = [];
  const casts: SpellId[] = [];
  let active = true;
  const caster = new VoiceCaster({ factory: () => { const rec = new FakeRecognition(); instances.push(rec); return rec; },
    onCast: (spell) => casts.push(spell), isActive: () => active });
  return { caster, casts, instances, setActive: (value: boolean) => { active = value; } };
}

test("incantations and ordinary names map to the canonical spells", () => {
  for (const [phrase, spell] of Object.entries({ incendio: "fireball", "FIREBALL!": "fireball", "cast fire ball please": "fireball", Protego: "shield", "cast shield": "shield", Glacius: "ice", "ice.": "ice", Fulmen: "ultimate", "ultimate please": "ultimate" })) {
    assert.equal(spellFromTranscript(phrase), spell, phrase);
  }
});
test("conversation, negation, empty input and multiple commands cannot cast", () => {
  for (const phrase of ["", "don't cast fireball", "I like ice cream", "fireball and shield", "fireballs", "prototype", "__proto__", "cast", "fireball shield", "not incendio"]) {
    assert.equal(spellFromTranscript(phrase), null, phrase);
  }
});
test("no recognition instance or microphone starts before user action", () => {
  const { instances, caster } = setup();
  assert.equal(instances.length, 0);
  assert.equal(caster.getSnapshot().status, "idle");
});
test("defaults to local recognition and requests a single utterance with interim text", () => {
  const { caster, instances } = setup();
  caster.start(); caster.start();
  assert.equal(instances.length, 1);
  assert.equal(instances[0].processLocally, true);
  assert.equal(instances[0].continuous, false);
  assert.equal(instances[0].interimResults, true);
  assert.equal(instances[0].lang, "en-US");
});
test("interim results display text but only a final result requests one spell", () => {
  const { caster, instances, casts } = setup();
  caster.start();
  instances[0].result("fireball", false);
  assert.equal(caster.getSnapshot().transcript, "fireball");
  assert.equal(caster.getSnapshot().interim, true);
  assert.deepEqual(casts, []);
  const late = instances[0].onresult!;
  instances[0].result("fireball");
  late({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "fireball" } }] });
  assert.deepEqual(casts, ["fireball"]);
  assert.equal(instances[0].aborts, 1);
  assert.equal(caster.getSnapshot().status, "idle");
});
test("a cumulative result batch still casts at most one command", () => {
  const { caster, instances, casts } = setup();
  caster.start();
  instances[0].onresult!({ resultIndex: 0, results: [
    { isFinal: true, 0: { transcript: "shield" } }, { isFinal: true, 0: { transcript: "ice" } },
  ] });
  assert.deepEqual(casts, ["shield"]);
});
test("an unrecognized final is transcribed without a game action", () => {
  const { caster, instances, casts } = setup();
  caster.start(); instances[0].result("hello wizard");
  assert.equal(caster.getSnapshot().transcript, "hello wizard");
  assert.match(caster.getSnapshot().message, /No single spell/);
  assert.deepEqual(casts, []);
});
test("cloud recognition cannot start unless explicitly allowed when local support is absent", () => {
  const rec = new FakeRecognition();
  delete (rec as Partial<FakeRecognition>).processLocally;
  const caster = new VoiceCaster({ factory: () => rec, onCast() {}, isActive: () => true });
  caster.start();
  assert.equal(rec.starts, 0);
  assert.match(caster.getSnapshot().message, /On-device recognition is unavailable/);
  caster.start(true);
  assert.equal(rec.starts, 1);
});
test("explicit browser-service mode disables local-only processing", () => {
  const { caster, instances } = setup();
  caster.start(true);
  assert.equal(instances[0].processLocally, false);
});
test("inactive matches cannot start recognition or submit a late final", () => {
  const { caster, setActive, instances, casts } = setup();
  setActive(false); caster.start(); assert.equal(instances.length, 0);
  setActive(true); caster.start(); setActive(false); instances[0].result("fireball");
  assert.deepEqual(casts, []);
  assert.match(caster.getSnapshot().message, /not active/);
});
test("stop and disposal abort the microphone and ignore captured late callbacks", () => {
  const { caster, instances, casts } = setup();
  caster.start(); const late = instances[0].onresult!;
  caster.stop();
  late({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "ice" } }] });
  caster.start(); const late2 = instances[1].onresult!;
  caster.dispose(); caster.dispose(); caster.start();
  late2({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "ice" } }] });
  assert.deepEqual(casts, []);
  assert.equal(instances.length, 2);
  assert.equal(instances[1].aborts, 1);
});
test("permission, network and language errors are recoverable without automatic retries", () => {
  const { caster, instances } = setup();
  for (const error of ["not-allowed", "network", "language-not-supported", "no-speech"]) {
    caster.start(); instances.at(-1)!.onerror!({ error });
    assert.equal(caster.getSnapshot().status, "idle");
  }
  assert.equal(instances.length, 4);
});
test("native start failure and unsupported browsers leave other controls usable", () => {
  const rec = new FakeRecognition(); rec.fail = true;
  const caster = new VoiceCaster({ factory: () => rec, onCast() {}, isActive: () => true });
  caster.start(); assert.equal(caster.getSnapshot().status, "idle");
  assert.match(caster.getSnapshot().message, /Could not start/);
  const unsupported = new VoiceCaster({ factory: null, onCast() {}, isActive: () => true });
  unsupported.start(); assert.equal(unsupported.getSnapshot().supported, false);
  unsupported.stop(); assert.match(unsupported.getSnapshot().message, /unavailable/);
});
test("a recognition session ending naturally never starts another microphone session", () => {
  const { caster, instances } = setup();
  caster.start(); instances[0].onend!();
  assert.equal(caster.getSnapshot().status, "idle");
  assert.equal(instances.length, 1);
});
