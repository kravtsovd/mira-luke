import { CartoonVideo, isTopicId, isValidYouTubeId } from "../data/catalog";
import { isProfileId } from "./profiles";

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord | null =>
  typeof value === "object" && value !== null ? value as JsonRecord : null;

const optionalText = (value: unknown, maxLength: number): string | undefined => {
  if (typeof value !== "string") return undefined;
  const clean = value.trim();
  return clean ? clean.slice(0, maxLength) : undefined;
};

// Database rows are untrusted runtime input. Only the small catalog contract reaches the player.
export function parseCatalogRows(payload: unknown): CartoonVideo[] {
  if (!Array.isArray(payload)) return [];
  const seen = new Set<string>();

  return payload.flatMap((value): CartoonVideo[] => {
    const row = asRecord(value);
    if (!row) return [];
    const id = typeof row.youtube_id === "string" ? row.youtube_id.trim() : undefined;
    const playbackId = typeof row.playback_id === "string" ? row.playback_id.trim() : undefined;
    const title = optionalText(row.title, 300);
    const channel = optionalText(row.channel, 200);
    const language = row.language;
    const topicId = typeof row.topic_id === "string" ? row.topic_id : null;
    if (!id || !isValidYouTubeId(id) || seen.has(id) || !title || !channel || !isTopicId(topicId)) return [];
    if (playbackId && !isValidYouTubeId(playbackId)) return [];
    if (language !== "en" && language !== "ru" && language !== "unknown") return [];

    const searchTerms = Array.isArray(row.search_terms)
      ? row.search_terms.flatMap((term) => {
        const clean = optionalText(term, 100);
        return clean ? [clean] : [];
      }).slice(0, 20)
      : [];

    // A database without the profiles column simply leaves every video on both shelves.
    const profiles = Array.isArray(row.profiles)
      ? [...new Set(row.profiles.filter(isProfileId))]
      : [];

    seen.add(id);
    return [{
      id,
      ...(playbackId && playbackId !== id ? { playbackId } : {}),
      title,
      channel,
      language,
      topicId,
      ...(typeof row.created_at === "string" && Number.isFinite(Date.parse(row.created_at)) ? { addedAt: new Date(row.created_at).toISOString() } : {}),
      ...(row.source_url === `https://www.youtube.com/watch?v=${id}` ? { sourceUrl: row.source_url } : {}),
      ...(row.thumbnail_url === `https://i.ytimg.com/vi/${id}/hqdefault.jpg` ? { thumbnailUrl: row.thumbnail_url } : {}),
      ...(Number.isSafeInteger(row.duration_seconds) && (row.duration_seconds as number) >= 0 ? { durationSeconds: row.duration_seconds as number } : {}),
      ...(typeof row.published_at === "string" && Number.isFinite(Date.parse(row.published_at)) ? { publishedAt: new Date(row.published_at).toISOString() } : {}),
      ...(Array.isArray(row.tags) ? { tags: [...new Set(row.tags.flatMap(tag => typeof tag === "string" && tag.trim() ? [tag.trim().slice(0, 40)] : []))].slice(0, 10) } : {}),
      ...(optionalText(row.duration_label, 20) ? { durationLabel: optionalText(row.duration_label, 20) } : {}),
      ...(searchTerms.length ? { searchTerms } : {}),
      ...(profiles.length ? { profiles } : {}),
    }];
  });
}
