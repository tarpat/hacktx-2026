/**
 * Replays recorded gesture sessions through the live pipeline and reports how each did.
 * Record on /gesture-test, then: npm run replay-gestures -w client [files...]
 */
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RECORDING_TARGETS, replay, type GestureRecording } from "../src/gesture/recording";

const CASTS = new Set(["FIREBALL_CAST", "SHIELD_CAST", "ICE_CAST", "TAURUS_CAST", "ULTIMATE_CAST"]);
const dir = fileURLToPath(new URL("../test/fixtures/gestures", import.meta.url));
const files = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => join(dir, f));
if (files.length === 0) console.log("No recordings yet. Record some on /gesture-test.");

for (const file of files) {
  const recording = JSON.parse(readFileSync(file, "utf8")) as GestureRecording;
  const { frames, actions } = replay(recording);
  const seconds = frames.length > 1 ? (frames.at(-1)!.timestampMs - frames[0].timestampMs) / 1000 : 0;
  const target = RECORDING_TARGETS[recording.label];
  const casts = actions.filter((a) => CASTS.has(a.action));
  const hits = casts.filter((a) => a.action === target).length;
  const wrong = casts.filter((a) => a.action !== target);
  const count = (key: "rawPose" | "pose") => {
    const counts: Record<string, number> = {};
    for (const f of frames) counts[f[key]] = (counts[f[key]] ?? 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p} ${Math.round((n / frames.length) * 100)}%`).join(", ");
  };
  const changes = (key: "rawPose" | "pose") => frames.filter((f, i) => i > 0 && f[key] !== frames[i - 1][key]).length;
  const ms = (n: number) => `${Math.round(n)}ms`;

  console.log(`\n${basename(file)} — ${recording.label}${target ? ` ×${recording.reps}` : ""}`);
  console.log(`  ${seconds.toFixed(1)}s, ${frames.length} frames (${(frames.length / Math.max(seconds, 0.001)).toFixed(0)}fps), hands in ${Math.round((frames.filter((f) => f.hands > 0).length / frames.length) * 100)}% of frames`);
  console.log(`  casts: ${target ? `${hits}/${recording.reps} ${target}` : "expected none"}${wrong.length ? `, WRONG: ${wrong.map((a) => a.action).join(", ")}` : ""}`);
  console.log(`  cancels: ${actions.filter((a) => a.action === "CHARGE_CANCEL").length}`);
  console.log(`  raw pose:      ${count("rawPose")} (${changes("rawPose")} changes)`);
  console.log(`  smoothed pose: ${count("pose")} (${changes("pose")} changes)`);
  const gaps = frames.slice(1).map((f, i) => f.timestampMs - frames[i].timestampMs).sort((a, b) => a - b);
  if (gaps.length) console.log(`  frame gap: median ${ms(gaps[gaps.length >> 1])}, worst ${ms(gaps.at(-1)!)}`);
  const live = recording.actions.map((a) => a.action).join(",");
  if (live !== actions.map((a) => a.action).join(",")) console.log(`  note: live run emitted ${live || "nothing"}`);
}
