import { requestFamily } from "@/app/lib/auth";
import { LibraryBurstGuard } from "@/app/lib/library-auth";
const searchGuard = new LibraryBurstGuard();
import { createLibraryTicket } from "@/app/lib/library-auth";
import { buildYouTubeApiUrl, normalizeYouTubeQuery, parseYouTubeSearchResponse } from "@/app/lib/youtube-search";

export async function GET(request: Request) {
  const family = requestFamily(request);
  if (!family) return Response.json({ error: "Sign in required" }, { status: 401 });
  try { searchGuard.check(family); }
  catch { return Response.json({ error: "Too many searches" }, { status: 429 }); }
  const query = normalizeYouTubeQuery(new URL(request.url).searchParams.get("q") ?? "");
  if (query.length < 2) {
    return Response.json({ error: "Введите хотя бы 2 символа." }, { status: 400 });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Поиск YouTube пока не подключён." }, { status: 503 });
  }

  try {
    const response = await fetch(buildYouTubeApiUrl(query, apiKey), {
      next: { revalidate: 300 },
    });
    if (!response.ok) {
      return Response.json({ error: "YouTube сейчас не ответил. Попробуйте ещё раз." }, { status: 502 });
    }

    const items = parseYouTubeSearchResponse(await response.json()).map(item => {
      try { return { ...item, libraryTicket: createLibraryTicket(item.id) }; }
      catch { return item; } // Searching still works when saving is not configured.
    });
    return Response.json(
      { items },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return Response.json({ error: "YouTube сейчас не ответил. Попробуйте ещё раз." }, { status: 502 });
  }
}
