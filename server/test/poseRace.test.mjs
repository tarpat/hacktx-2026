import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { io } from "socket.io-client";

test("online pose race shares targets, validates samples, and assigns the winner from the socket", { timeout: 25_000 }, async (t) => {
  // Deterministic server-side event selection without a production debug endpoint.
  const entry = new URL("../dist/index.js", import.meta.url).href;
  const child = spawn(process.execPath, ["--input-type=module", "--eval", `Math.random = () => 0.8; await import(${JSON.stringify(entry)})`], { env: { ...process.env, PORT: "0", NODE_ENV: "production", CLIENT_ORIGIN: "" }, stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => child.kill());
  let logs = "";
  child.stderr.on("data", (data) => { logs += data; });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Startup timed out: ${logs}`)), 8_000);
    child.stdout.on("data", (data) => {
      logs += data;
      const port = logs.match(/listening on port (\d+)/)?.[1];
      if (port) { clearTimeout(timer); resolve(Number(port)); }
    });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${logs}`)); });
  });
  const a = io(`http://127.0.0.1:${port}`, { transports: ["websocket"], forceNew: true });
  const b = io(`http://127.0.0.1:${port}`, { transports: ["websocket"], forceNew: true });
  t.after(() => { a.disconnect(); b.disconnect(); });
  await Promise.all([a, b].map((socket) => new Promise((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); })));
  let latest;
  const seen = [];
  a.on("MATCH_STATE", (state, events) => { latest = state; seen.push(...events); });
  const until = async (predicate) => {
    const deadline = Date.now() + 5_000;
    while (!predicate(latest)) {
      if (Date.now() > deadline) throw new Error("Expected match state did not arrive");
      await delay(25);
    }
    return latest;
  };
  const room = await a.timeout(3_000).emitWithAck("CREATE_ROOM");
  await b.timeout(3_000).emitWithAck("JOIN_ROOM", room.room.code, null);
  a.emit("READY_STATUS", true); b.emit("READY_STATUS", true);
  await until((s) => s?.phase === "active");
  await a.timeout(3_000).emitWithAck("CAST_REQUEST", { spell: "fireball", clientActionId: "pose-a" });
  await b.timeout(3_000).emitWithAck("CAST_REQUEST", { spell: "fireball", clientActionId: "pose-b" });
  await until((s) => s?.struggle?.kind === "pose");
  const race = latest.struggle.poseRace;
  const fromB = new Promise((resolve) => b.on("MATCH_STATE", (s) => { if (s.struggle?.kind === "pose") resolve(s.struggle.poseRace.id); }));
  assert.equal(await fromB, race.id);
  await delay(Math.max(0, race.readyAt - Date.now()) + 50);
  b.emit("POSE_SAMPLE", null);
  b.emit("POSE_SAMPLE", { struggleId: race.id, step: 4, matched: true });
  b.emit("POSE_SAMPLE", { struggleId: "old-race", step: 0, matched: true });
  a.emit("STRUGGLE_PUSH");
  const blocked = await a.timeout(3_000).emitWithAck("CAST_REQUEST", { spell: "ice", clientActionId: "during-race" });
  assert.equal(blocked.reason, "clash");
  assert.equal(latest.struggle.poseRace.progress.B.step, 0);
  for (let step = 0; step < 5; step++) {
    for (let i = 0; i < 3; i++) {
      b.emit("POSE_SAMPLE", { struggleId: race.id, step, matched: false, slot: "A" });
      await delay(110);
    }
    for (let i = 0; i < 6; i++) {
      b.emit("POSE_SAMPLE", { struggleId: race.id, step, matched: true, slot: "A" });
      await delay(110);
    }
    if (step < 4) await until((s) => s.struggle?.poseRace?.progress.B.step === step + 1);
  }
  await until((s) => !s.struggle && s.players.A.hp === 60);
  assert.equal(seen.find((e) => e.type === "SPELL_CLASH").winner, "B");
  assert.equal(latest.players.B.stats.clashesWon, 1);
  assert.equal(latest.players.B.hp, 100);
});
