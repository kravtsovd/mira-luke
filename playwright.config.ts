import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 60_000,
  expect: { timeout: 20_000 },
  workers: 1,
  retries: 0,
  use: {
    baseURL: process.env.PLAYBACK_BASE_URL ?? "http://localhost:3210",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "touch", testIgnore: /fullscreen.spec.ts/, use: { ...devices["Pixel 7"] } },
    {
      name: "tablet-webkit",
      grep: /phone tall|iPad classic|iPad Pro 13|cold home selection/,
      use: { ...devices["iPad Pro 11"], browserName: "webkit" },
    },
  ],
  webServer: process.env.PLAYBACK_BASE_URL ? undefined : {
    command: "npm run build && npm run start -- --port 3210",
    url: "http://localhost:3210",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
