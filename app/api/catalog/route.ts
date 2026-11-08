import { fetchCatalogSnapshot } from "@/app/lib/catalog-store";
import { requestFamily } from "@/app/lib/auth";
import { familyChildIds } from "@/app/lib/family-store";

export const dynamic = "force-dynamic";

export async function GET(request?: Request) {
  const snapshot = await fetchCatalogSnapshot();
  const familyId = request ? requestFamily(request) : null;
  const children = new Set(familyId ? await familyChildIds(familyId) : []);
  const items = snapshot.videos.flatMap(video => {
    if (!video.profiles?.length) return [video];
    const own = video.profiles.filter(profile => children.has(profile));
    return own.length ? [{ ...video, profiles: own }] : [];
  });
  return Response.json(
    { items, source: snapshot.source },
    { headers: { "Cache-Control": "no-store, max-age=0", Vary: "Cookie" } },
  );
}
