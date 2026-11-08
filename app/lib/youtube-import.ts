import "server-only";

export const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
export interface Candidate { videoId: string; title: string; channel: string; source: "liked" | "playlist" | "subscription" }
const API = "https://www.googleapis.com/youtube/v3";
const MAX_IDS = 600;

async function yt(path: string, token: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${API}/${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`YouTube ${response.status}`);
  return await response.json() as Record<string, unknown>;
}
const items = (body: Record<string, unknown>) => (Array.isArray(body.items) ? body.items : []) as Record<string, any>[];

export async function collectCandidates(token: string): Promise<Candidate[]> {
  const found = new Map<string, Candidate["source"]>();
  const add = (id: unknown, source: Candidate["source"]) => { if (typeof id === "string" && /^[\w-]{11}$/.test(id) && !found.has(id) && found.size < MAX_IDS) found.set(id, source); };

  let page = "";
  for (let i = 0; i < 2; i += 1) {
    const liked = await yt(`videos?myRating=like&part=id&maxResults=50${page ? `&pageToken=${page}` : ""}`, token);
    items(liked).forEach(item => add(item.id, "liked"));
    page = typeof liked.nextPageToken === "string" ? liked.nextPageToken : ""; if (!page) break;
  }
  const playlists = items(await yt("playlists?mine=true&part=id&maxResults=25", token)).slice(0, 8);
  for (const list of playlists) {
    items(await yt(`playlistItems?playlistId=${encodeURIComponent(list.id)}&part=contentDetails&maxResults=25`, token)).forEach(item => add(item.contentDetails?.videoId, "playlist"));
  }
  const subs = items(await yt("subscriptions?mine=true&part=snippet&maxResults=50&order=relevance", token));
  const channelIds = subs.map(sub => sub.snippet?.resourceId?.channelId).filter((id): id is string => typeof id === "string").slice(0, 30);
  if (channelIds.length) {
    const channels = items(await yt(`channels?part=contentDetails&id=${channelIds.join(",")}`, token));
    for (const channel of channels) {
      const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
      if (typeof uploads === "string") items(await yt(`playlistItems?playlistId=${encodeURIComponent(uploads)}&part=contentDetails&maxResults=6`, token)).forEach(item => add(item.contentDetails?.videoId, "subscription"));
    }
  }

  const ids = [...found.keys()];
  const kids: Candidate[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = items(await yt(`videos?part=snippet,status&id=${ids.slice(i, i + 50).join(",")}`, token));
    for (const video of batch) {
      if (video.status?.madeForKids !== true || video.status?.embeddable === false) continue;
      const title = String(video.snippet?.title ?? "").trim().slice(0, 300);
      const channel = String(video.snippet?.channelTitle ?? "").trim().slice(0, 200);
      if (title && channel) kids.push({ videoId: String(video.id), title, channel, source: found.get(String(video.id))! });
    }
  }
  return kids;
}

async function database(path: string, init?: RequestInit) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("storage unavailable");
  const response = await fetch(new URL(`/rest/v1/${path}`, base), { ...init, cache: "no-store", signal: AbortSignal.timeout(10_000),
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" } });
  if (!response.ok) throw new Error("storage unavailable");
  return init?.method && init.method !== "GET" ? null : await response.json() as Record<string, unknown>[];
}

export async function saveCandidates(familyId: string, candidates: Candidate[]) {
  await database(`youtube_import_candidates?family_id=eq.${encodeURIComponent(familyId)}`, { method: "DELETE" });
  if (candidates.length) await database("youtube_import_candidates", { method: "POST", body: JSON.stringify(candidates.map(c => ({ family_id: familyId, video_id: c.videoId, title: c.title, channel: c.channel, source: c.source }))) });
}

export async function listCandidates(familyId: string) {
  const rows = await database(`youtube_import_candidates?family_id=eq.${encodeURIComponent(familyId)}&select=video_id,title,channel,source&order=source.asc,created_at.asc`) ?? [];
  return rows.map(row => ({ videoId: String(row.video_id), title: String(row.title), channel: String(row.channel), source: String(row.source) }));
}

export async function dropCandidates(familyId: string, videoIds: string[]) {
  if (videoIds.length) await database(`youtube_import_candidates?family_id=eq.${encodeURIComponent(familyId)}&video_id=in.(${videoIds.map(encodeURIComponent).join(",")})`, { method: "DELETE" });
}
