import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/** Serves MediaPipe's wasm from node_modules at /mediapipe/wasm and copies it into the build, so it always matches the installed version. */
function mediapipeWasm(): Plugin {
  const dir = join(dirname(createRequire(import.meta.url).resolve("@mediapipe/tasks-vision")), "wasm");
  const prefix = "/mediapipe/wasm/";
  return {
    name: "mediapipe-wasm",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.split("?")[0].replace(/^.*\/mediapipe\/wasm\//, "");
        if (!req.url?.includes(prefix) || !name || !readdirSync(dir).includes(name)) return next();
        res.setHeader("Content-Type", name.endsWith(".wasm") ? "application/wasm" : "text/javascript");
        res.end(readFileSync(join(dir, name)));
      });
    },
    generateBundle() {
      for (const name of readdirSync(dir)) this.emitFile({ type: "asset", fileName: `mediapipe/wasm/${name}`, source: readFileSync(join(dir, name)) });
    },
  };
}

export default defineConfig({
  plugins: [react(), mediapipeWasm()],
  // Keep the same-origin Socket.IO URL in development and production.
  server: { proxy: { "/socket.io": { target: process.env.DEV_SERVER_URL || "http://127.0.0.1:3001", ws: true } } },
  // Use the shared source directly so engine edits hot-reload without rebuilding the package.
  resolve: { alias: { "@spellcaster/shared": fileURLToPath(new URL("../shared/src/index.ts", import.meta.url)) } },
});
