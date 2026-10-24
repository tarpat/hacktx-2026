import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { createWebApp } from "../dist/web.js";

test("production serves the SPA, assets, health and real 404s from one origin", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "spellcaster-web-"));
  await mkdir(join(directory, "assets"));
  await writeFile(join(directory, "index.html"), "<!doctype html><title>SpellCaster fixture</title>");
  await writeFile(join(directory, "assets", "app-a1b2.js"), "console.log('asset');");
  const server = createWebApp({ clientDirectory: directory, requireClient: true }).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
    assert.ok(directory.startsWith(join(tmpdir(), "spellcaster-web-")));
    await rm(directory, { recursive: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.deepEqual(await (await fetch(`${base}/health`)).json(), { status: "ok" });
  for (const route of ["/", "/practice?mode=hotseat", "/arena", "/calibration", "/gesture-test"]) {
    const response = await fetch(base + route, { headers: { Accept: "text/html" } });
    assert.equal(response.status, 200, route);
    assert.match(await response.text(), /SpellCaster fixture/, route);
    assert.match(response.headers.get("cache-control"), /no-cache/, route);
  }
  const asset = await fetch(`${base}/assets/app-a1b2.js`);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("cache-control"), /immutable/);
  assert.match(asset.headers.get("content-type"), /javascript/);
  for (const route of ["/assets/missing.js", "/missing.png", "/api/missing", "/socket.io/missing"]) {
    const response = await fetch(base + route, { headers: { Accept: "text/html" } });
    assert.equal(response.status, 404, route);
    assert.doesNotMatch(await response.text(), /SpellCaster fixture/, route);
  }
  assert.equal((await fetch(`${base}/unknown`, { headers: { Accept: "application/json" } })).status, 404);
});

test("production fails clearly when the client was not built", () => {
  assert.throws(() => createWebApp({ clientDirectory: "/missing-spellcaster-client", requireClient: true }), /Run npm run build/);
});

test("API-only development works without a client build and optional CORS is explicit", async (t) => {
  const server = createWebApp({ clientDirectory: "/missing-spellcaster-client", allowedOrigins: ["https://example.test"] }).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/health`, { headers: { Origin: "https://example.test" } });
  assert.equal(response.headers.get("access-control-allow-origin"), "https://example.test");
  assert.equal((await fetch(base)).status, 404);
});
