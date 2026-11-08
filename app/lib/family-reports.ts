import "server-only";
import { createHash } from "node:crypto";

export const REPORT_NAMES = ["viewer.html", "skill-tree.html"] as const;
export type ReportName = (typeof REPORT_NAMES)[number];
export const isReportName = (value: unknown): value is ReportName => REPORT_NAMES.includes(value as ReportName);

async function database(path: string, init: RequestInit = {}) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("Report storage unavailable");
  const response = await fetch(new URL(`/rest/v1/${path}`, base), {
    ...init, cache: "no-store", signal: AbortSignal.timeout(10_000),
    headers: { apikey: key, Authorization: `Bearer ${key}`, ...(init.body ? { "Content-Type": "application/json", Prefer: "return=minimal" } : {}) },
  });
  if (!response.ok) throw new Error("Report storage unavailable");
  return init.body ? [] : await response.json() as Record<string, unknown>[];
}

export async function listReports(familyId: string) {
  const rows = await database(`family_reports?family_id=eq.${encodeURIComponent(familyId)}&select=name,updated_at`);
  return rows.filter(row => isReportName(row.name)).map(row => ({ name: row.name as ReportName, updatedAt: String(row.updated_at) }));
}

export async function readReport(familyId: string, name: ReportName): Promise<string | null> {
  const rows = await database(`family_reports?family_id=eq.${encodeURIComponent(familyId)}&name=eq.${encodeURIComponent(name)}&select=html`);
  return typeof rows[0]?.html === "string" ? rows[0].html : null;
}

/** Replace a stored page (the sha256 lets publish_family_reports.py tell it from its own copy). */
export async function saveReport(familyId: string, name: ReportName, html: string) {
  const sha256 = createHash("sha256").update(html, "utf8").digest("hex");
  await database(`family_reports?family_id=eq.${encodeURIComponent(familyId)}&name=eq.${encodeURIComponent(name)}`, {
    method: "PATCH", body: JSON.stringify({ html, sha256, updated_at: new Date().toISOString() }),
  });
}
