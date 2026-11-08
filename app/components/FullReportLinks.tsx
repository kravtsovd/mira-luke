"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";

const LABELS: Record<string, string> = { "viewer.html": "Полная статистика", "skill-tree.html": "Дерево навыков" };

/** Names of the full dashboards this signed-in family has (empty until known or when signed out). */
export function useFullReports(enabled = true) {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    if (!enabled) { setNames([]); return; }
    let alive = true;
    fetch("/api/family/reports", { cache: "no-store" }).then(response => response.json())
      .then(payload => { if (alive && Array.isArray(payload.reports)) setNames(payload.reports.map((report: { name: string }) => report.name)); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [enabled]);
  return names;
}

export default function FullReportLinks() {
  const names = useFullReports();
  const shown = ["viewer.html", "skill-tree.html"].filter(name => names.includes(name));
  if (!shown.length) return null;
  return <div className="full-report-links" data-testid="full-report-links">
    {shown.map(name => <a key={name} className="button" href={`/family/report/${name}`} target="_blank" rel="noopener" data-testid={`full-report-${name}`}>
      {LABELS[name]}<ExternalLink aria-hidden="true" />
    </a>)}
  </div>;
}
