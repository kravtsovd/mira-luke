import { getSession } from "../../../lib/auth";
import { cachedReportData, embeddedData, readFamilyReportData, withData, withNotice } from "../../../lib/family-report-data";
import { isReportName, readReport, REPORT_NAMES, saveReport } from "../../../lib/family-reports";
import { familyChildIds } from "../../../lib/family-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A fresh PostHog read takes 10-50 s when PostHog is busy; after 100 s it gives up and the page keeps its stored numbers.
export const maxDuration = 120;

const page = (status: number, text: string) => new Response(
  `<!doctype html><meta charset="utf-8"><title>Статистика</title><body style="font:18px system-ui;max-width:560px;margin:15vh auto;padding:0 20px"><p>${text}</p><p><a href="/">К мультикам</a></p>`,
  { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });

const serve = (html: string, source: "pending" | "live" | "snapshot") => new Response(withNotice(html, source), { headers: {
  "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex",
  "Content-Security-Policy": "frame-ancestors 'none'", "Referrer-Policy": "no-referrer", "X-Report-Data": source,
} });

export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!isReportName(file)) return page(404, "Такой страницы нет.");
  const session = getSession(request);
  if (!session) {
    const back = new URL(`/api/auth/google?return=${encodeURIComponent(`/family/report/${file}`)}`, request.url);
    return Response.redirect(back, 302);
  }
  const { familyId } = session;
  let html: string | null;
  try { html = await readReport(familyId, file); }
  catch { return page(503, "Не удалось загрузить статистику. Обновите страницу через минуту."); }
  if (!html) return page(404, "Полная статистика для вашей семьи пока не подключена.");

  const cached = cachedReportData(familyId);
  if (!cached && new URL(request.url).searchParams.get("data") !== "live") return serve(html, "pending");
  const stored = html;
  const data = cached ?? await familyChildIds(familyId)
    .then(children => readFamilyReportData(familyId, children, embeddedData(stored)?.titles)).catch(() => null);
  const fresh = data && withData(html, data);
  if (!data || !fresh) return serve(html, "snapshot");
  if (!cached) {
    await Promise.all(REPORT_NAMES.map(async name => {
      const updated = name === file ? fresh : withData(await readReport(familyId, name) ?? "", data);
      if (updated) await saveReport(familyId, name, updated);
    })).catch(() => { /* the next opening reads PostHog again */ });
  }
  return serve(fresh, "live");
}
