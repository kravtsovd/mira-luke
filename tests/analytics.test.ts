// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ init: vi.fn(), capture: vi.fn(), register: vi.fn() }));
vi.mock("posthog-js", () => ({ default: sdk }));

beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllEnvs(); });

it("does not initialize or capture without a project token and host", async () => {
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "");
  const { initAnalytics, track } = await import("../app/lib/analytics");
  initAnalytics(); track("video_selected");
  expect(sdk.init).not.toHaveBeenCalled();
  expect(sdk.capture).not.toHaveBeenCalled();
});

it("strips URL parameters, blocks private replay surfaces and drops network payloads", async () => {
  const { analyticsConfig, setAnalyticsContext } = await import("../app/lib/analytics");
  setAnalyticsContext({ app: "mira-luke", is_test: true });
  const config = analyticsConfig("https://us.i.posthog.com");
  const beforeSend = config.before_send;
  if (typeof beforeSend !== "function") throw new Error("Missing sanitizer");
  const event = beforeSend({ uuid: "00000000-0000-0000-0000-000000000001", event: "$pageview", properties: { $current_url: "https://example.com/?q=private#secret", $referrer: "https://example.org/?ticket=private" } });
  expect(event?.properties.$current_url).toBe("https://example.com/");
  expect(event?.properties.$referrer).toBe("https://example.org/");
  expect(event?.properties.is_test).toBe(true);
  expect(config.session_recording?.maskAllInputs).toBe(true);
  expect(config.session_recording?.blockSelector).toContain("[data-private]");
  expect(config.session_recording?.recordHeaders).toBe(false);
  expect(config.session_recording?.recordBody).toBe(false);
  expect(config.person_profiles).toBe("never");
  expect(config.ip).toBe(false);
});
