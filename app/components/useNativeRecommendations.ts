"use client";

import { useEffect, useState } from "react";
import { CartoonVideo, getPlaybackId, getVideo } from "../data/catalog";
import { parseRecommendations, RecommendationBatch } from "../lib/recommendations";
import { track } from "../lib/analytics";

declare global {
  interface Window { __kidsRecommendations?: unknown; }
}

export default function useNativeRecommendations(currentVideo: CartoonVideo, catalogVideos: CartoonVideo[], enabled = true) {
  const sourceVideoId = getPlaybackId(currentVideo);
  const [batch, setBatch] = useState<RecommendationBatch | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let nativeReceived = false;
    const receive = () => {
      const next = parseRecommendations(window.__kidsRecommendations);
      if (!next || next.sourceVideoId !== sourceVideoId) return;
      nativeReceived = true;
      setBatch(next);
    };
    setBatch(null);
    window.addEventListener("kids-recommendations", receive);
    receive();
    void (async () => {
      try {
        const response = await fetch(`/api/youtube-recommendations?videoId=${sourceVideoId}`, { signal: controller.signal });
        if (!response.ok) {
          if (!controller.signal.aborted) track("recommendations_failed", { video_id: sourceVideoId, http_status: response.status });
          return;
        }
        const next = parseRecommendations(await response.json());
        if (!controller.signal.aborted && !nativeReceived && next?.sourceVideoId === sourceVideoId) {
          track("recommendations_loaded", { video_id: sourceVideoId, result_count: next.videos.length });
          setBatch(next);
        }
      } catch {
        if (!controller.signal.aborted) track("recommendations_failed", { video_id: sourceVideoId });
      }
    })();
    return () => { controller.abort(); window.removeEventListener("kids-recommendations", receive); };
  }, [sourceVideoId, enabled]);

  if (!enabled || batch?.sourceVideoId !== sourceVideoId) return [];
  return batch.videos.map((video): CartoonVideo => ({ ...(getVideo(video.id, catalogVideos) ?? {
    ...video, channel: "YouTube", language: video.language!, topicId: currentVideo.topicId,
  }), language: video.language! }));
}
