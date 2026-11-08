import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/youtube-watch-secondary.json";
import { extractWatchData, parseWatchRecommendations, filterRecommendationAudio } from "../app/lib/youtube-recommendations";

const source = "ZcZVtt-baas";
const cards = fixture.contents.twoColumnWatchNextResults.secondaryResults.secondaryResults.results[0].itemSectionRenderer.contents;

describe("live YouTube watch-page recommendation data", () => {
  it("extracts ranked candidates from the captured watch rail", () => {
    const result = parseWatchRecommendations(fixture, source);
    expect(result.sourceVideoId).toBe(source);
    expect(result.videos).toEqual(cards.slice(0, 50).map(card => ({
      id: card.lockupViewModel.contentId,
      title: card.lockupViewModel.metadata.lockupMetadataViewModel.title.content,
    })));
  });

  it("reads JSON without executing trailing scripts and handles escaped strings", () => {
    const data = { ...fixture, boundary: 'quoted " } { \\ text' };
    const html = `<script>var ytInitialData = ${JSON.stringify(data)}; throw new Error('must not execute');</script>`;
    expect(extractWatchData(html)).toEqual(data);
    expect(extractWatchData('<html>Consent required</html>')).toBeNull();
    expect(extractWatchData('var ytInitialData = {broken};')).toBeNull();
  });

  it("does not substitute unrelated page videos if the rail is unavailable", () => {
    expect(parseWatchRecommendations({ elsewhere: cards }, source).videos).toEqual([]);
    expect(parseWatchRecommendations(null, source).videos).toEqual([]);
  });

  it("skips the current video without changing the order of remaining cards", () => {
    const result = parseWatchRecommendations(fixture, cards[0].lockupViewModel.contentId);
    expect(result.videos.map(video => video.id)).toEqual(cards.slice(1, 51).map(card => card.lockupViewModel.contentId));
  });
});

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("checks audio rather than translated titles, then takes the first two allowed languages", async () => {
  vi.stubEnv("YOUTUBE_API_KEY", "test-key");
  const batch = { sourceVideoId: source, videos: [
    { id: "foreign0001", title: "English title" },
    { id: "unknown0001", title: "Русское название" },
    { id: "russian0001", title: "Русское видео" },
    { id: "english0001", title: "English video" },
    { id: "english0002", title: "Another English video" },
  ] };
  const fetcher = vi.fn().mockResolvedValue(Response.json({ items: [
    { id: "foreign0001", snippet: { defaultAudioLanguage: "es", defaultLanguage: "en" } },
    { id: "unknown0001", snippet: { defaultLanguage: "ru" } },
    { id: "russian0001", snippet: { defaultAudioLanguage: "ru-RU" } },
    { id: "english0001", snippet: { defaultAudioLanguage: "en-US" } },
    { id: "english0002", snippet: { defaultAudioLanguage: "en" } },
  ] }));
  vi.stubGlobal("fetch", fetcher);
  const result = await filterRecommendationAudio(batch);
  expect(result.videos.map(video => [video.id, video.language])).toEqual([["russian0001", "ru"], ["english0001", "en"]]);
  expect(new URL(String(fetcher.mock.calls[0][0])).searchParams.get("id")).toBe(batch.videos.map(video => video.id).join(","));
});

it("fails closed when audio metadata cannot be fetched", async () => {
  const batch = parseWatchRecommendations(fixture, source);
  vi.stubEnv("YOUTUBE_API_KEY", "");
  const fetcher = vi.fn().mockRejectedValue(new Error("offline"));
  vi.stubGlobal("fetch", fetcher);
  expect((await filterRecommendationAudio(batch)).videos).toEqual([]);
  expect(fetcher).not.toHaveBeenCalled();
  vi.stubEnv("YOUTUBE_API_KEY", "test-key");
  expect((await filterRecommendationAudio(batch)).videos).toEqual([]);
  fetcher.mockResolvedValue(Response.json({ error: "quota" }, { status: 403 }));
  expect((await filterRecommendationAudio(batch)).videos).toEqual([]);
});
