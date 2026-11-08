import "server-only";

import { CartoonVideo, VIDEOS } from "@/app/data/catalog";
import { parseCatalogRows } from "@/app/lib/catalog-records";

export interface CatalogSnapshot {
  videos: CartoonVideo[];
  source: "database" | "fallback";
}
export async function fetchCatalogSnapshot(): Promise<CatalogSnapshot> {
  const baseUrl = process.env.SUPABASE_URL;
  const apiKey = process.env.SUPABASE_ANON_KEY;
  if (!baseUrl || !apiKey) return { videos: VIDEOS, source: "fallback" };

  try {
    const url = new URL("/rest/v1/videos", baseUrl);
    url.searchParams.set("select", "*");
    url.searchParams.set("enabled", "eq.true");
    url.searchParams.set("order", "sort_order.asc,created_at.asc");
    const response = await fetch(url, {
      headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { videos: VIDEOS, source: "fallback" };
    const videos = parseCatalogRows(await response.json());
    return videos.length > 0 ? { videos, source: "database" } : { videos: VIDEOS, source: "fallback" };
  } catch {
    return { videos: VIDEOS, source: "fallback" };
  }
}
