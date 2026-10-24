import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { io } from "socket.io-client";
import { DEFAULT_MATCH_CONFIG } from "@spellcaster/shared";

test("production server runs outside the repo cwd and accepts two WebSocket players", { timeout: 20_000 }, async (t) => {
  const entry = fileURLToPath(new URL("../dist/index.js", import.meta.url));
  const child = spawn(process.execPath, [entry], { cwd: tmpdir(), env: { ...process.env, PORT: "0", NODE_ENV: "production", CLIENT_ORIGIN: "" }, stdio: ["ignore", "pipe", "pipe"] });
  let logs = "";
  child.stderr.on("data", (data) => { logs += data; });
  t.after(() => { child.kill(); });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Startup timed out: ${logs}`)), 8_000);
    child.stdout.on("data", (data) => {
      logs += data;
      const match = logs.match(/listening on port (\d+)/);
      if (match) { clearTimeout(timer); resolve(Number(match[1])); }
    });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${logs}`)); });
  });
  const base = `http://127.0.0.1:${port}`;
  assert.deepEqual(await (await fetch(`${base}/health`)).json(), { status: "ok" });
  const page = await fetch(`${base}/practice?mode=hotseat`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<div id="root"><\/div>/);
  assert.equal((await fetch(`${base}/assets/missing.js`)).status, 404);
  const a = io(base, { transports: ["websocket"], forceNew: true });
  const b = io(base, { transports: ["websocket"], forceNew: true });
  t.after(() => { a.disconnect(); b.disconnect(); });
  const connected = (socket) => new Promise((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); });
  await Promise.all([connected(a), connected(b)]);
  const room = await a.timeout(3_000).emitWithAck("CREATE_ROOM");
  const joined = await b.timeout(3_000).emitWithAck("JOIN_ROOM", room.room.code, null);
  assert.equal(joined.playerSlot, "B");
  const active = new Promise((resolve) => a.on("MATCH_STATE", (state) => { if (state.phase === "active") resolve(); }));
  a.emit("READY_STATUS", true); b.emit("READY_STATUS", true);
  await active;
  const damage = new Promise((resolve) => b.on("MATCH_STATE", (state, events) => {
    if (events.some((event) => event.type === "DAMAGE_APPLIED")) resolve(state.players.B.hp);
  }));
  assert.equal((await a.timeout(3_000).emitWithAck("CAST_REQUEST", { spell: "fireball", clientActionId: "production-test" })).ok, true);
  assert.equal(await damage, DEFAULT_MATCH_CONFIG.maxHp - DEFAULT_MATCH_CONFIG.spells.fireball.damage);
  assert.equal(a.io.engine.transport.name, "websocket");
});
