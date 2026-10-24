import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/combat-browser",
  fullyParallel: false,
  timeout: 45_000,
  use: {
    baseURL: "http://127.0.0.1:4176",
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node ../server/dist/index.js",
      url: "http://127.0.0.1:3185/health",
      env: { PORT: "3185", CLIENT_ORIGIN: "http://127.0.0.1:4176" },
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 4176 --strictPort",
      url: "http://127.0.0.1:4176",
      env: { VITE_SERVER_URL: "http://127.0.0.1:3185" },
    },
  ],
});
