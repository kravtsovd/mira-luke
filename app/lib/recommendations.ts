import { CartoonVideo, getVideosForProfile } from "../data/catalog";
import { ProfileId } from "./profiles";

export interface RecommendationBatch {
  sourceVideoId: string;
  videos: { id: string; title: string; durationLabel?: string; language?: "ru" | "en" }[];
}

export function isRecommendationLanguage(value: unknown): value is "ru" | "en" {
  return value === "ru" || value === "en";
}

export function parseRecommendations(value: unknown): RecommendationBatch | null {
  if (!value || typeof value !== "object") return null;
  const batch = value as Partial<RecommendationBatch>;
  if (typeof batch.sourceVideoId !== "string" || !/^[\w-]{11}$/.test(batch.sourceVideoId) || !Array.isArray(batch.videos)) return null;
  const ids = new Set<string>();
  const videos: RecommendationBatch["videos"] = [];
  for (const item of batch.videos.slice(0, 50)) {
    if (!item || typeof item.id !== "string" || !/^[\w-]{11}$/.test(item.id) || item.id === batch.sourceVideoId || ids.has(item.id)) continue;
    if (typeof item.title !== "string" || !item.title.trim() || item.title.length > 300) continue;
    if (!isRecommendationLanguage(item.language)) continue;
    ids.add(item.id);
    videos.push({ language: item.language, id: item.id, title: item.title.trim(), ...(typeof item.durationLabel === "string" && item.durationLabel.length < 20 ? { durationLabel: item.durationLabel } : {}) });
    if (videos.length === 2) break;
  }
  return { sourceVideoId: batch.sourceVideoId, videos };
}

export function buildForYou(catalog: CartoonVideo[], recommendations: CartoonVideo[], currentId?: string) {
  const ids = new Set<string>();
  const first = recommendations.filter(video => isRecommendationLanguage(video.language)).filter(video => video.id !== currentId && !ids.has(video.id) && ids.add(video.id)).slice(0, 2);
  const seen = new Set(first.map(video => video.id));
  return [...first, ...catalog.filter(video => !seen.has(video.id))];
}

export function buildProfileFeed(profile: ProfileId, catalog: CartoonVideo[], recommendations: CartoonVideo[], currentId?: string) {
  const shelf = getVideosForProfile(profile, catalog);
  const personal = shelf.filter(video => video.profiles?.length === 1);
  const personalIds = new Set(personal.map(video => video.id));
  return [...personal, ...buildForYou(shelf.filter(video => !personalIds.has(video.id)),
    getVideosForProfile(profile, recommendations).filter(video => !personalIds.has(video.id)), currentId)];
}
