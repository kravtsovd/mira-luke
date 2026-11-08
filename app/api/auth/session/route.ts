import { getSession, googleConfig, requestFamily } from "../../../lib/auth";
import { familyName } from "../../../lib/family-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = getSession(request);
  const familyId = requestFamily(request);
  let name = "";
  if (familyId) { try { name = await familyName(familyId); } catch { /* The name is decoration; the family id is enough. */ } }
  return Response.json({
    signedIn: !!session, email: session?.email ?? null, userName: session?.name ?? null,
    family: familyId ? { id: familyId, name } : null, googleConfigured: !!googleConfig(),

    youtubeImport: !!googleConfig() && process.env.YOUTUBE_IMPORT !== "0",
  }, { headers: { "Cache-Control": "no-store" } });
}
