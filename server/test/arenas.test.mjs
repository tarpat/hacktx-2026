import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { io } from "socket.io-client";

test("online arenas ignore client preferences, synchronize both players and allow rematch repeats", { timeout: 15_000 }, async (t) => {
  const entry = new URL("../dist/index.js", import.meta.url).href;
  // Short real matches exercise the production rematch path. This only changes the test child process.
  const preload = `const { DEFAULT_MATCH_CONFIG } = await import('@spellcaster/shared'); Object.assign(DEFAULT_MATCH_CONFIG, { countdownMs: 100, roundMs: 150, suddenDeathMs: 100 }); Math.random = () => .8; await import(${JSON.stringify(entry)});`;
  const child = spawn(process.execPath, ["--input-type=module", "--eval", preload], { env: { ...process.env, PORT: "0", NODE_ENV: "production", CLIENT_ORIGIN: "" }, stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => child.kill());
  let logs = "";
  child.stderr.on("data", (data) => { logs += data; });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Startup timed out: ${logs}`)), 8_000);
    child.stdout.on("data", (data) => {
      logs += data;
      const match = logs.match(/listening on port (\d+)/);
      if (match) { clearTimeout(timer); resolve(Number(match[1])); }
    });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${logs}`)); });
  });
  const a = io(`http://127.0.0.1:${port}`, { transports: ["websocket"], forceNew: true });
  const b = io(`http://127.0.0.1:${port}`, { transports: ["websocket"], forceNew: true });
  t.after(() => { a.disconnect(); b.disconnect(); });
  await Promise.all([a, b].map((socket) => new Promise((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); })));
  let stateA, stateB;
  a.on("MATCH_STATE", (state) => { stateA = state; });
  b.on("MATCH_STATE", (state) => { stateB = state; });
  const until = async (predicate) => {
    const deadline = Date.now() + 3_000;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error("Expected match state did not arrive");
      await delay(10);
    }
  };
  const created = await a.timeout(3_000).emitWithAck("CREATE_ROOM");
  await b.timeout(3_000).emitWithAck("JOIN_ROOM", created.room.code, null);
  // An outdated or modified client must not be able to choose an online arena.
  a.emit("STAGE_PREFERENCE", 0); b.emit("STAGE_PREFERENCE", 1);
  a.emit("READY_STATUS", true); b.emit("READY_STATUS", true);
  await until(() => stateA && stateB);
  assert.equal(stateA.stageId, 2);
  assert.equal(stateB.stageId, 2);
  await until(() => stateA.phase === "finished" && stateB.phase === "finished");
  stateA = stateB = null;
  a.emit("STAGE_PREFERENCE", 0);
  a.emit("READY_STATUS", true); b.emit("READY_STATUS", true);
  await until(() => stateA && stateB);
  assert.equal(stateA.stageId, 2); // Every match draws from all three, including the previous stage.
  assert.equal(stateB.stageId, 2);
});
