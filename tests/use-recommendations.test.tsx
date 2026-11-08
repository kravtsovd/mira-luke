// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { VIDEOS } from "../app/data/catalog";
import fixture from "./fixtures/youtube-watch-secondary.json";
import { parseWatchRecommendations } from "../app/lib/youtube-recommendations";
import useNativeRecommendations from "../app/components/useNativeRecommendations";

afterEach(() => { vi.unstubAllGlobals(); delete window.__kidsRecommendations; });

it("loads two server recommendations and preserves catalog metadata", async () => {
  const batch = { sourceVideoId: VIDEOS[0].id, videos: [VIDEOS[1], { id: "russian0001", title: "Русское видео", language: "ru" }] };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(batch)));
  const { result } = renderHook(() => useNativeRecommendations(VIDEOS[0], VIDEOS));
  await waitFor(() => expect(result.current.map(video => video.id)).toEqual(batch.videos.map(video => video.id)));
});

it("discards a late response after switching videos and aborts the old request", async () => {
  let resolve!: (response: Response) => void;
  const pending = new Promise<Response>(done => { resolve = done; });
  const fetcher = vi.fn().mockReturnValueOnce(pending).mockResolvedValue(Response.json({ sourceVideoId: VIDEOS[1].id, videos: [] }));
  vi.stubGlobal("fetch", fetcher);
  const { result, rerender } = renderHook(({ video }) => useNativeRecommendations(video, VIDEOS), { initialProps: { video: VIDEOS[0] } });
  rerender({ video: VIDEOS[1] });
  expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  await act(async () => { resolve(Response.json(parseWatchRecommendations(fixture, VIDEOS[0].id))); });
  expect(result.current).toEqual([]);
});

it("makes no request on the home screen and leaves an empty list on upstream failure", async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error("YouTube unavailable"));
  vi.stubGlobal("fetch", fetcher);
  const { result, rerender } = renderHook(({ enabled }) => useNativeRecommendations(VIDEOS[0], VIDEOS, enabled), { initialProps: { enabled: false } });
  expect(fetcher).not.toHaveBeenCalled();
  rerender({ enabled: true });
  await act(async () => {});
  expect(result.current).toEqual([]);
});

it("never grants playback to recommendations with missing or unsupported language", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ sourceVideoId: VIDEOS[0].id, videos: [
    { id: "foreign0001", title: "English title", language: "fr" },
    { id: "unknown0001", title: "Unknown" },
    { id: "russian0001", title: "Русское видео", language: "ru" },
  ] })));
  const { result } = renderHook(() => useNativeRecommendations(VIDEOS[0], VIDEOS));
  await waitFor(() => expect(result.current.map(video => video.id)).toEqual(["russian0001"]));
  expect(result.current[0].language).toBe("ru");
});
