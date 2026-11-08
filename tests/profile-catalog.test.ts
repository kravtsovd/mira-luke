import { describe, expect, it } from "vitest";
import { CartoonVideo, getVideosForProfile, VIDEOS } from "../app/data/catalog";
import { parseCatalogRows } from "../app/lib/catalog-records";

const video = (id: string, profiles?: CartoonVideo["profiles"]): CartoonVideo => ({
  id,
  title: `Video ${id}`,
  channel: "Test channel",
  language: "en",
  topicId: "learning",
  ...(profiles ? { profiles } : {}),
});

describe("per-child shelves", () => {
  it("keeps shared videos on both shelves and private ones on a single shelf", () => {
    const videos = [video("aaaaaaaaaaa"), video("bbbbbbbbbbb", ["mira"]), video("ccccccccccc", ["luke"])];
    expect(getVideosForProfile("mira", videos).map(item => item.id)).toEqual(["bbbbbbbbbbb", "aaaaaaaaaaa"]);
    expect(getVideosForProfile("luke", videos).map(item => item.id)).toEqual(["ccccccccccc", "aaaaaaaaaaa"]);
  });

  it("treats an empty profile list as shared", () => {
    const videos = [video("ddddddddddd", [])];
    expect(getVideosForProfile("mira", videos)).toHaveLength(1);
    expect(getVideosForProfile("luke", videos)).toHaveLength(1);
  });

  it("gives each child a usable shelf from the shipped catalog", () => {
    for (const profile of ["mira", "luke"] as const) {
      const shelf = getVideosForProfile(profile, VIDEOS);
      expect(shelf.length).toBeGreaterThan(20);
      expect(new Set(shelf.map(item => item.topicId)).size).toBe(5);
    }
    const mira = getVideosForProfile("mira", VIDEOS).map(item => item.id);
    const luke = getVideosForProfile("luke", VIDEOS).map(item => item.id);
    // Numberblocks belongs to Mira, Handyman Hal's excavators to Luke.
    expect(mira).toContain("lZKiCgJa-fA");
    expect(luke).toContain("lZKiCgJa-fA");
    expect(luke).toContain("kf0YK8L-sh8");
    expect(mira).toContain("kf0YK8L-sh8");
  });

  it("reads the profiles column, keeps well-formed child ids and drops malformed values", () => {
    const [parsed] = parseCatalogRows([{
      youtube_id: "eeeeeeeeeee",
      title: "Row",
      channel: "Channel",
      language: "en",
      topic_id: "vehicles",
      profiles: ["luke", "luke", "mira", "c-1a2b3c", "Dad!", 7],
    }]);
    expect(parsed.profiles).toEqual(["luke", "mira", "c-1a2b3c"]);
  });

  it("leaves videos shared when the database has no profiles column yet", () => {
    const [parsed] = parseCatalogRows([{
      youtube_id: "fffffffffff",
      title: "Row",
      channel: "Channel",
      language: "en",
      topic_id: "vehicles",
    }]);
    expect(parsed.profiles).toBeUndefined();
    expect(getVideosForProfile("mira", [parsed])).toHaveLength(1);
    expect(getVideosForProfile("luke", [parsed])).toHaveLength(1);
  });
});

it("ranks personal additions newest first, then keeps the shared catalog in its original order", () => {
  const source = [
    video("shared00001"),
    { ...video("lukeolder01", ["luke"]), addedAt: "2026-09-20T00:00:00Z" },
    { ...video("miranewer01", ["mira"]), addedAt: "2026-09-23T00:00:00Z" },
    { ...video("lukenewer01", ["luke"]), addedAt: "2026-09-22T00:00:00Z", language: "unknown" as const },
    video("shared00002", ["mira", "luke"]),
  ];
  expect(getVideosForProfile("luke", source).map(v => v.id)).toEqual(["lukenewer01", "lukeolder01", "shared00001", "shared00002"]);
  expect(getVideosForProfile("mira", source).map(v => v.id)).toEqual(["miranewer01", "shared00001", "shared00002"]);
  expect(source[0].id).toBe("shared00001");
});

it("uses the library creation date rather than YouTube's publication date", () => {
  const [item] = parseCatalogRows([{ youtube_id: "datevideo01", title: "Video", channel: "Channel", language: "en", topic_id: "vehicles", created_at: "2026-09-22T01:00:00Z", published_at: "2020-01-01T00:00:00Z" }]);
  expect(item.addedAt).toBe("2026-09-22T01:00:00.000Z");
  expect(item.publishedAt).toBe("2020-01-01T00:00:00.000Z");
});
