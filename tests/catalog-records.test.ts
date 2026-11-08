import { describe, expect, it } from "vitest";
import { parseCatalogRows } from "../app/lib/catalog-records";

describe("database catalog records", () => {
  it("maps valid Supabase rows to the player contract in database order", () => {
    expect(parseCatalogRows([
      {
        youtube_id: "9qShcQMq1cA",
        playback_id: null,
        title: " Peppa Pig ",
        channel: " Official Channel ",
        language: "en",
        topic_id: "stories",
        duration_label: "22:00",
        search_terms: ["пеппа", " water slide "],
      },
    ])).toEqual([{
      id: "9qShcQMq1cA",
      title: "Peppa Pig",
      channel: "Official Channel",
      language: "en",
      topicId: "stories",
      durationLabel: "22:00",
      searchTerms: ["пеппа", "water slide"],
    }]);
  });

  it("drops malformed, duplicate and unknown-category rows", () => {
    const valid = {
      youtube_id: "9qShcQMq1cA",
      title: "Peppa Pig",
      channel: "Official Channel",
      language: "en",
      topic_id: "stories",
      search_terms: [],
    };
    expect(parseCatalogRows([
      valid,
      valid,
      { ...valid, youtube_id: "bad" },
      { ...valid, youtube_id: "IOtFxP2JJqI", topic_id: "unknown" },
      { ...valid, youtube_id: "ZGO2It1eQF8", playback_id: "bad" },
    ])).toHaveLength(1);
  });
});
