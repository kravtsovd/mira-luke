import { describe, expect, it, vi } from "vitest";
import { PlaybackAnalytics } from "../app/lib/playback-analytics";

function setup() {
  let now = 0;
  const emit = vi.fn();
  const analytics = new PlaybackAnalytics("video-a", emit, () => now);
  const sample = (position: number, visible = true, elapsed = 1000) => {
    now += elapsed;
    analytics.sample(position, visible);
  };
  const watched = () => emit.mock.calls.filter(([event]) => event === "video_watch_time").reduce((sum, [, properties]) => sum + Number(properties.watched_seconds), 0);
  return { analytics, emit, sample, watched };
}

describe("playback measurements", () => {
  it("counts actual progress once across heartbeats, pauses and final flush", () => {
    const { analytics, sample, watched, emit } = setup();
    analytics.request();
    analytics.change(1);
    for (let i = 0; i <= 21; i++) sample(i);
    analytics.change(2);
    for (let i = 0; i < 10; i++) sample(21);
    analytics.flush("unmount");
    expect(watched()).toBe(21);
    expect(emit.mock.calls.filter(([name]) => name === "video_started")).toHaveLength(1);
  });

  it("excludes seeks, background tabs and suspended timers", () => {
    const { analytics, sample, watched } = setup();
    analytics.change(1);
    sample(0); sample(1); sample(90); sample(91);
    sample(92, false); sample(120, true); sample(121);
    sample(151, true, 30000); sample(152);
    analytics.flush("exit");
    expect(watched()).toBe(4);
  });

  it("reports one stall per episode and recovery without counting buffering as watching", () => {
    const { analytics, sample, emit, watched } = setup();
    analytics.change(3);
    for (let i = 0; i < 11; i++) sample(7);
    expect(emit.mock.calls.filter(([name]) => name === "video_stalled")).toHaveLength(1);
    expect(watched()).toBe(0);
    analytics.change(1);
    expect(emit.mock.calls.filter(([name]) => name === "video_stall_recovered")).toHaveLength(1);
    sample(7); sample(8);
    analytics.flush("exit");
    expect(watched()).toBe(1);
  });

  it("never labels a paused or hidden player as stalled", () => {
    const { analytics, sample, emit } = setup();
    analytics.change(2);
    for (let i = 0; i < 10; i++) sample(0);
    analytics.change(1);
    for (let i = 0; i < 10; i++) sample(0, false);
    expect(emit.mock.calls.some(([name]) => name === "video_stalled")).toBe(false);
  });

  it("flushes the previous video before switching and deduplicates repeated states", () => {
    const { analytics, sample, emit } = setup();
    analytics.change(1); sample(0); sample(1);
    analytics.select("video-b");
    analytics.change(1); analytics.change(1);
    sample(0); sample(1); analytics.change(0); analytics.change(0);
    const chunks = emit.mock.calls.filter(([name]) => name === "video_watch_time");
    expect(chunks.map(([, properties]) => properties.video_id)).toEqual(["video-a", "video-b"]);
    expect(emit.mock.calls.filter(([name]) => name === "video_completed")).toHaveLength(1);
  });
});
