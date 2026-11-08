import { getSession } from "../../../lib/auth";
import { listReports } from "../../../lib/family-reports";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = getSession(request);
  if (!session) return Response.json({ reports: [] }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try { return Response.json({ reports: await listReports(session.familyId) }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ reports: [] }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
