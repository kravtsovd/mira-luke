import posthog, { type PostHogConfig } from "posthog-js";

type Properties = Record<string, string | number | boolean | null | undefined>;
let enabled = false;
let context: Properties = {};

export function analyticsContext() { return { ...context }; }

export function track(event: string, properties: Properties = {}) {
  if (!enabled) return;
  try { posthog.capture(event, { ...context, ...properties }); } catch { /* Analytics must never interrupt a gesture. */ }
}

export function setAnalyticsContext(properties: Properties) {
  context = { ...context, ...properties };
  if (enabled) {
    try { posthog.register(context); } catch { /* Storage can be unavailable. */ }
  }
}

export function analyticsConfig(host: string): Partial<PostHogConfig> {
  return {
    api_host: host,
    defaults: "2026-05-30",
    person_profiles: "never",
    persistence: "sessionStorage",
    ip: false,
    capture_pageview: "history_change",
    capture_pageleave: true,
    capture_exceptions: true,
    capture_performance: { web_vitals: true },
    autocapture: { dom_event_allowlist: ["click"], capture_copied_text: false },
    rageclick: true,
    capture_dead_clicks: true,
    disable_session_recording: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
    enable_recording_console_log: false,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "[data-private]",
      blockSelector: "iframe, [data-private], .ph-no-capture",
      recordCrossOriginIframes: false,
      recordHeaders: false,
      recordBody: false,
      maskCapturedNetworkRequestFn: () => null,
    },

    before_send: (event) => {
      if (!event) return null;
      event.properties = { ...context, ...event.properties };
      for (const key of ["$current_url", "$referrer", "$initial_current_url", "$initial_referrer"]) {
        const value = event.properties[key];
        if (typeof value === "string") {
          try { const url = new URL(value); event.properties[key] = url.origin + url.pathname; }
          catch { delete event.properties[key]; }
        }
      }
      return event;
    },
  };
}

export function initAnalytics() {
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (process.env.NEXT_PUBLIC_ANALYTICS_ENABLED !== "true" || enabled || typeof window === "undefined" || !token || !host) return;
  // Local QA must be explicitly enabled and remains distinguishable in every report.
  const local = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  if (local && process.env.NEXT_PUBLIC_POSTHOG_DEBUG !== "true") return;
  try {
    context = { ...context, app: "mira-luke", analytics_version: 1, build: process.env.NEXT_PUBLIC_BUILD ?? "local", is_test: window.location.hostname !== "localhost" };
    posthog.init(token, analyticsConfig(host));
    enabled = true;
    setAnalyticsContext(context);
    track("app_opened");
    window.addEventListener("online", () => track("connection_changed", { online: true }));
    window.addEventListener("offline", () => track("connection_changed", { online: false }));
    if (typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
      let lastReport = -Infinity;
      const observer = new PerformanceObserver((list) => {
        const slowest = Math.max(...list.getEntries().map(entry => entry.duration));
        if (document.visibilityState === "visible" && slowest >= 250 && performance.now() - lastReport >= 10000) {
          track("ui_long_task", { duration_ms: Math.round(slowest), threshold_ms: 250 });
          lastReport = performance.now();
        }
      });
      observer.observe({ type: "longtask", buffered: true });
    }
  } catch { enabled = false; }
}
