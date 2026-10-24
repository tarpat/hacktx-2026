import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Keep the same-origin Socket.IO URL in development and production.
  server: { proxy: { "/socket.io": { target: process.env.DEV_SERVER_URL || "http://127.0.0.1:3001", ws: true } } },
  // Use the shared source directly so engine edits hot-reload without rebuilding the package.
  resolve: { alias: { "@spellcaster/shared": fileURLToPath(new URL("../shared/src/index.ts", import.meta.url)) } },
});
