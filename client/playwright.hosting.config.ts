import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/hosting",
  workers: 1,
  timeout: 45_000,
  use: { baseURL: "http://127.0.0.1:4180", channel: process.env.PLAYWRIGHT_CHANNEL || undefined, trace: "retain-on-failure" },
  webServer: {
    command: "node ../server/dist/index.js",
    url: "http://127.0.0.1:4180/health",
    env: { NODE_ENV: "production", PORT: "4180", CLIENT_ORIGIN: "" },
  },
});
