import { requestFamily } from "@/app/lib/auth";
import { extractWatchData, parseWatchRecommendations, filterRecommendationAudio } from "@/app/lib/youtube-recommendations";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!requestFamily(request)) return Response.json({ error: "Sign in required" }, { status: 401 });
  if (process.env.YOUTUBE_RECOMMENDATIONS_ENABLED !== "1") return Response.json({ videos: [] }, { headers: { "Cache-Control": "no-store" } });
  const sourceVideoId = new URL(request.url).searchParams.get("videoId") ?? "";
  if (!/^[A-Za-z0-9_-]{11}$/.test(sourceVideoId)) {
    return Response.json({ error: "Invalid video ID" }, { status: 400 });
  }
  try {
    const url = new URL("https://www.youtube.com/watch");
    url.searchParams.set("v", sourceVideoId);
    url.searchParams.set("hl", "en");
    url.searchParams.set("gl", "US");

    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "en-US,en;q=0.9" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!response.ok || !response.body) throw new Error("YouTube unavailable");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let html = "", bytes = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 6_000_000) { await reader.cancel(); throw new Error("Response too large"); }
      html += decoder.decode(value, { stream: true });
    }
    html += decoder.decode();
    const data = extractWatchData(html);
    if (!data) throw new Error("Watch data unavailable");
    const batch = await filterRecommendationAudio(parseWatchRecommendations(data, sourceVideoId));
    return Response.json(batch, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ sourceVideoId, videos: [] }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
