import { describe, expect, it } from "vitest";
import { VIDEOS } from "../app/data/catalog";
import { buildForYou, parseRecommendations } from "../app/lib/recommendations";

describe("two YouTube recommendations followed by the family catalog", () => {
  it("preserves rank, caps at two and removes catalog duplicates", () => {
    const result = buildForYou(VIDEOS, [VIDEOS[4], VIDEOS[3], VIDEOS[2]]);
    expect(result.slice(0, 3).map(v => v.id)).toEqual([VIDEOS[4].id, VIDEOS[3].id, VIDEOS[0].id]);
    expect(new Set(result.map(v => v.id)).size).toBe(VIDEOS.length);
    expect(result).toHaveLength(VIDEOS.length);
  });
  it("never fills missing recommendations with invented recommendations", () => {
    expect(buildForYou(VIDEOS, [])).toEqual(VIDEOS);
    expect(buildForYou(VIDEOS, [VIDEOS[1]], VIDEOS[1].id)).toEqual(VIDEOS);
  });
  it("skips foreign and unknown languages before choosing two recommendations", () => {
    const result = parseRecommendations({ sourceVideoId: VIDEOS[0].id, videos: [
      { id: "foreign0001", title: "English title", language: "es" },
      { id: "unknown0001", title: "Unknown English title" },
      { id: "russian0001", title: "Маша и Медведь", language: "ru" },
      VIDEOS[1], VIDEOS[2],
    ] });
    expect(result?.videos.map(v => v.id)).toEqual(["russian0001", VIDEOS[1].id]);
    const unknown = { ...VIDEOS[0], id: "unknown0001", language: "unknown" as const };
    expect(buildForYou(VIDEOS, [unknown, VIDEOS[1], VIDEOS[2]]).slice(0, 2)).toEqual([VIDEOS[1], VIDEOS[2]]);
  });
  it("validates IDs and titles, drops duplicates, and cannot grant a third slot", () => {
    expect(parseRecommendations({ sourceVideoId: VIDEOS[0].id, videos: [
      { id: VIDEOS[1].id, title: VIDEOS[1].title, language: "en" },
      { id: VIDEOS[1].id, title: VIDEOS[1].title, language: "en" },
      { id: VIDEOS[2].id, title: VIDEOS[2].title, language: "en" },
    ] })?.videos).toHaveLength(2);
    expect(parseRecommendations({ sourceVideoId: "invalid", videos: [] })).toBeNull();
    expect(parseRecommendations({ sourceVideoId: VIDEOS[0].id, videos: [{ id: VIDEOS[1].id, title: "" }] })?.videos).toEqual([]);
  });
});

it("keeps personal new picks above recommendations and excludes the other child's shelf", async () => {
  const { buildProfileFeed } = await import("../app/lib/recommendations");
  const own = { ...VIDEOS[0], profiles: ["luke"] as const };
  const other = { ...VIDEOS[1], profiles: ["mira"] as const };
  const shared = { ...VIDEOS[2], profiles: [] };
  const result = buildProfileFeed("luke", [shared, { ...own, profiles: ["luke"] }], [{ ...other, profiles: ["mira"] }, shared]);
  expect(result.map(v => v.id)).toEqual([own.id, shared.id]);
});
