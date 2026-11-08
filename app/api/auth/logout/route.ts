import { clearSessionCookie, sameOrigin } from "../../../lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  return new Response(null, { status: 204, headers: { "Set-Cookie": clearSessionCookie(request), "Cache-Control": "no-store" } });
}
