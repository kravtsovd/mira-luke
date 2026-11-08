import { isTopicId, isValidYouTubeId, TopicId } from "../data/catalog";
import { isProfileId, ProfileId } from "./profiles";

export class LibraryError extends Error {
  constructor(public code: string, message: string, public status = 400, public manualAllowed = false) {
    super(message);
  }
}

export function normalizeVideoId(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048) throw new LibraryError("invalid_video", "Некорректная ссылка на видео.");
  const text = value.trim();
  if (isValidYouTubeId(text)) return text;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error();
    const host = url.hostname.toLowerCase();
    let id: string | null = null;
    if (host === "youtu.be") id = url.pathname.slice(1);
    if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)) {
      if (url.pathname === "/watch") id = url.searchParams.get("v");
      else id = /^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1] ?? null;
    }
    if (id && isValidYouTubeId(id)) return id;
  } catch { /* Invalid URLs share the same safe validation message. */ }
  throw new LibraryError("invalid_video", "Нужна ссылка на видео YouTube или его ID.");
}

export function normalizeTags(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 10 || value.some(tag => typeof tag !== "string" || tag.length > 100)) {
    throw new LibraryError("invalid_tags", "Можно указать до 10 тегов, каждый до 40 символов.");
  }
  const tags = value.map((tag: string) => tag.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().toLocaleLowerCase("ru-RU")).filter(Boolean);
  if (tags.some(tag => tag.length > 40)) throw new LibraryError("invalid_tags", "Тег не должен быть длиннее 40 символов.");
  return [...new Set(tags)];
}

export function parseLibraryInput(value: unknown): { id: string; topicId?: TopicId; tags: string[]; profile: ProfileId } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LibraryError("invalid_request", "Некорректный запрос.");
  const body = value as Record<string, unknown>;
  if (!isProfileId(body.profile)) throw new LibraryError("invalid_profile", "Выберите профиль ребёнка. Если страница давно открыта, обновите её.");
  if (body.topicId !== undefined && (typeof body.topicId !== "string" || !isTopicId(body.topicId))) {
    throw new LibraryError("invalid_category", "Выберите категорию из списка.");
  }
  return { profile: body.profile, id: normalizeVideoId(body.videoId ?? body.url), topicId: body.topicId as TopicId | undefined, tags: normalizeTags(body.tags) };
}
