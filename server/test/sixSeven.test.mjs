import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { io } from "socket.io-client";

test("online 6–7 beats synchronize both clients and score the authenticated rival", { timeout: 20_000 }, async (t) => {
  const entry = new URL("../dist/index.js", import.meta.url).href;
  const child = spawn(process.execPath, ["--input-type=module", "--eval", `Math.random = () => 0.1; await import(${JSON.stringify(entry)})`], {
    env: { ...process.env, PORT: "0", NODE_ENV: "production", CLIENT_ORIGIN: "" }, stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill());
  let logs = "";
  child.stderr.on("data", (data) => { logs += data; });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Startup timed out: ${logs}`)), 8000);
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
  await Promise.all([a, b].map((socket) => new Promise((resolve, reject) => {
    socket.once("connect", resolve); socket.once("connect_error", reject);
  })));
  const latest = {};
  const seen = [];
  a.on("MATCH_STATE", (state, events) => { latest.A = state; seen.push(...events); });
  b.on("MATCH_STATE", (state) => { latest.B = state; });
  const until = async (predicate) => {
    const deadline = Date.now() + 5000;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error("Expected synchronized match state did not arrive");
      await delay(25);
    }
  };
  const room = await a.timeout(3000).emitWithAck("CREATE_ROOM");
  await b.timeout(3000).emitWithAck("JOIN_ROOM", room.room.code, null);
  a.emit("STRUGGLE_PUSH"); // Inputs outside a collision have no effect.
  a.emit("READY_STATUS", true); b.emit("READY_STATUS", true);
  await until(() => latest.A?.phase === "active" && latest.B?.phase === "active");
  await a.timeout(3000).emitWithAck("CAST_REQUEST", { spell: "fireball", clientActionId: "six-seven-a" });
  await b.timeout(3000).emitWithAck("CAST_REQUEST", { spell: "fireball", clientActionId: "six-seven-b" });
  await until(() => latest.A?.struggle?.kind === "pump" && latest.B?.struggle?.kind === "pump");
  assert.equal(latest.A.struggle.endsAt - latest.A.struggle.startedAt, 6700);
  assert.deepEqual(latest.A.struggle.pushes, { A: 0, B: 0 });
  for (let i = 0; i < 15; i++) {
    b.emit("STRUGGLE_PUSH", { slot: "A" }); // Payload cannot impersonate the other socket's wizard.
    await delay(130);
  }
  await until(() => !latest.A.struggle && !latest.B.struggle && latest.A.players.A.hp < latest.A.players.A.maxHp && latest.B.players.A.hp === latest.A.players.A.hp);
  const clash = seen.find((event) => event.type === "SPELL_CLASH");
  assert.equal(clash?.winner, "B");
  assert.equal(clash?.challenge, "pump");
  assert.equal(latest.A.players.B.hp, latest.A.players.B.maxHp);
  assert.equal(latest.B.players.B.stats.clashesWon, 1);
});
