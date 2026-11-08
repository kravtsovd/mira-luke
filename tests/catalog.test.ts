import { describe, expect, it } from "vitest";
import {
  getTopic,
  getPlaybackId,
  getVideo,
  getVideosForTopic,
  isValidYouTubeId,
  TOPICS,
  VIDEOS,
} from "../app/data/catalog";

describe("cartoon catalog", () => {
  it("has a closed taxonomy of five well-populated bilingual topics", () => {
    const expectedCounts = {
      stories: 18,
      learning: 33,
      vehicles: 24,
      songs: 17,
      adventures: 24,
    };

    expect(TOPICS).toHaveLength(5);
    expect(VIDEOS).toHaveLength(116);
    for (const topic of TOPICS) {
      expect(getVideosForTopic(topic.id)).toHaveLength(expectedCounts[topic.id]);
      expect(getVideosForTopic(topic.id).length).toBeGreaterThanOrEqual(7);
      expect(getTopic(topic.id)).toEqual(topic);
    }
  });

  it("contains unique valid YouTube IDs", () => {
    const ids = VIDEOS.map((video) => video.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(isValidYouTubeId(id)).toBe(true));
  });

  it("contains English and Russian viewing interests with direct playback IDs", () => {
    expect(new Set(VIDEOS.map((video) => video.language))).toEqual(new Set(["en", "ru"]));
    for (const id of ["IZcTkcMhn-w", "QycdWH1E_KM", "1NRO36d_Wro", "Cl0dGQqr1J4", "msGMkMhYw_U"]) {
      const video = getVideo(id);
      expect(video).toBeDefined();
      expect(getPlaybackId(video!)).toBe(id);
    }
  });

  it("rejects malformed direct-link IDs", () => {
    expect(isValidYouTubeId("short")) .toBe(false);
    expect(isValidYouTubeId("<script>")) .toBe(false);
    expect(isValidYouTubeId(null)).toBe(false);
  });
});
