"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import FamilyStats from "./FamilyStats";
import FullReportLinks from "./FullReportLinks";
import { ChildProfile, ProfileId } from "../lib/profiles";

export default function StatsDialog({ family, active, familyName, onClose }: { family: ChildProfile[]; active: ProfileId; familyName?: string; onClose: () => void }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    titleRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", handleKeyDown); };
  }, [onClose]);

  return <div className="modal-overlay" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) onClose(); }}>
    <section className="settings-panel stats-panel" role="dialog" aria-modal="true" aria-labelledby="stats-dialog-title" data-testid="stats-dialog">
      <header className="settings-header">
        <div>
          <p className="settings-kicker">Для взрослых{familyName ? ` · ${familyName}` : ""}</p>
          <h2 id="stats-dialog-title" ref={titleRef} tabIndex={-1}>Как дети смотрят и играют</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть статистику" data-testid="stats-close"><X aria-hidden="true" /></button>
      </header>
      <div className="settings-body"><FullReportLinks /><FamilyStats family={family} active={active} /></div>
    </section>
  </div>;
}
