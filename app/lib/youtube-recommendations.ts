import { RecommendationBatch } from "./recommendations";

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function extractWatchData(html: string): unknown {
  const marker = /(?:var\s+ytInitialData|window\["ytInitialData"\]|ytInitialData)\s*=\s*/g;
  for (const match of html.matchAll(marker)) {
    const start = match.index! + match[0].length;
    if (html[start] !== "{") continue;
    let depth = 0, quoted = false, escaped = false;
    for (let i = start; i < html.length; i++) {
      const char = html[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === "{") depth++;
      else if (char === "}" && --depth === 0) {
        try { return JSON.parse(html.slice(start, i + 1)); } catch { break; }
      }
    }
  }
  return null;
}

export function parseWatchRecommendations(data: unknown, sourceVideoId: string): RecommendationBatch {
  const batch: RecommendationBatch = { sourceVideoId, videos: [] };
  const seen = new Set([sourceVideoId]);
  const contents = record(record(data).contents);
  const secondary = record(record(contents.twoColumnWatchNextResults).secondaryResults);
  const results = record(secondary.secondaryResults).results;
  // Only the watch-page recommendation rail defines rank; ignore ads, Shorts shelves, playlists and recommendations elsewhere in the response.
  const visit = (items: unknown) => {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (batch.videos.length === 50) return;
      const node = record(item);
      if (node.itemSectionRenderer) { visit(record(node.itemSectionRenderer).contents); continue; }
      const lockup = record(node.lockupViewModel);
      const compact = record(node.compactVideoRenderer);
      let id: unknown, title: unknown;
      if (lockup.contentType === "LOCKUP_CONTENT_TYPE_VIDEO") {
        id = lockup.contentId;
        title = record(record(record(lockup.metadata).lockupMetadataViewModel).title).content;
      } else if (node.compactVideoRenderer) {
        id = compact.videoId;
        const text = record(compact.title);
        title = text.simpleText ?? (Array.isArray(text.runs) ? text.runs.map(run => record(run).text ?? "").join("") : "");
      }
      if (typeof id !== "string" || !VIDEO_ID.test(id) || seen.has(id) || typeof title !== "string" || !title.trim()) continue;
      seen.add(id);
      batch.videos.push({ id, title: title.trim().slice(0, 300) });
    }
  };
  visit(results);
  return batch;
}

export async function filterRecommendationAudio(batch: RecommendationBatch): Promise<RecommendationBatch> {
  const empty = { sourceVideoId: batch.sourceVideoId, videos: [] };
  const key = process.env.YOUTUBE_API_KEY;
  if (!key || !batch.videos.length) return empty;
  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("id", batch.videos.slice(0, 50).map(video => video.id).join(","));
    url.searchParams.set("key", key);
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return empty;
    const items = record(await response.json()).items;
    if (!Array.isArray(items)) return empty;
    const languages = new Map<string, "ru" | "en">();
    for (const item of items) {
      const video = record(item);
      const audio = record(video.snippet).defaultAudioLanguage;
      const language = typeof audio === "string" ? audio.trim().toLowerCase().split("-")[0] : "";
      if (typeof video.id === "string" && (language === "ru" || language === "en")) languages.set(video.id, language);
    }
    return { sourceVideoId: batch.sourceVideoId, videos: batch.videos.flatMap(video => {
      const language = languages.get(video.id);
      return language ? [{ ...video, language }] : [];
    }).slice(0, 2) };
  } catch { return empty; }
}
