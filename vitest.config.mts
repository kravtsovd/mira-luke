import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: {
    "@": new URL("./", import.meta.url).pathname,
    "server-only": new URL("./node_modules/next/dist/compiled/server-only/empty.js", import.meta.url).pathname,
  } },
  test: {
    // Vercel inherits NODE_ENV=production, where React omits the act test API.
    env: { NODE_ENV: "test", APP_TIMEZONE: "America/Los_Angeles", POSTHOG_PROJECT_ID: "123" },
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
