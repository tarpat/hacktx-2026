import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RECORDING_TARGETS, replay, type GestureRecording } from "../src/gesture/recording";

const CASTS = new Set(["FIREBALL_CAST", "SHIELD_CAST", "ICE_CAST", "TAURUS_CAST", "ULTIMATE_CAST"]);
const dir = new URL("./fixtures/gestures/", import.meta.url);
const files = readdirSync(dir).filter((file) => file.endsWith(".json"));

/** Real sessions recorded on /gesture-test, replayed through the live pipeline. */
describe.runIf(files.length > 0)("recorded gestures", () => {
  for (const file of files) {
    const recording = JSON.parse(readFileSync(new URL(file, dir), "utf8")) as GestureRecording;
    const target = RECORDING_TARGETS[recording.label];
    const casts = replay(recording).actions.filter((a) => CASTS.has(a.action)).map((a) => a.action);

    if (target) {
      it(`${file}: casts ${target} for every rep and nothing else`, () => {
        expect(casts.filter((a) => a === target).length).toBeGreaterThanOrEqual(recording.reps);
        expect(casts.filter((a) => a !== target)).toEqual([]);
      });
    } else {
      it(`${file}: idle hands cast (almost) nothing`, () => {
        // One brief moment in the idle recording is a genuine shield stance, so allow one.
        expect(casts.length).toBeLessThanOrEqual(1);
      });
    }
  }
});
