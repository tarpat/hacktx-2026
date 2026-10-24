import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Use the shared source directly so engine edits hot-reload without rebuilding the package.
  resolve: { alias: { "@spellcaster/shared": fileURLToPath(new URL("../shared/src/index.ts", import.meta.url)) } },
});
