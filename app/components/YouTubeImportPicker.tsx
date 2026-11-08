"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import type { ChildProfile } from "../lib/profiles";

interface Candidate { videoId: string; title: string; channel: string; source: string }
const SOURCE: Record<string, string> = { liked: "Лайк", playlist: "Плейлист", subscription: "Подписка" };

export default function YouTubeImportPicker({ family, onClose }: { family: ChildProfile[]; onClose: () => void }) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [child, setChild] = useState(family[0]?.id ?? "");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [addedTotal, setAddedTotal] = useState(0);

  useEffect(() => {
    fetch("/api/youtube/candidates", { cache: "no-store" }).then(r => r.json())
      .then(p => setCandidates(Array.isArray(p.candidates) ? p.candidates : []))
      .catch(() => { setCandidates([]); setMessage("Не удалось загрузить список. Попробуйте позже."); });
  }, []);
  const list = useMemo(() => candidates ?? [], [candidates]);
  const toggle = (id: string) => setChosen(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const add = async () => {
    const ids = [...chosen]; setBusy(true); setMessage("");
    let added = 0, failed = 0;
    for (let i = 0; i < ids.length; i += 15) {
      setMessage(`Добавляем ${Math.min(i + 15, ids.length)} из ${ids.length}…`);
      try {
        const response = await fetch("/api/youtube/candidates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ child, videoIds: ids.slice(i, i + 15) }) });
        const payload = await response.json();
        if (!response.ok) { setMessage(payload.error ?? "Не получилось."); break; }
        added += payload.added.length; failed += payload.failed.length;
        setCandidates(current => (current ?? []).filter(c => !payload.added.includes(c.videoId)));
      } catch { setMessage("Нет связи с сервером."); break; }
    }
    setChosen(new Set()); setBusy(false); setAddedTotal(total => total + added);
    const name = family.find(f => f.id === child)?.name ?? "";
    setMessage(`${name}: добавлено ${added}${failed ? `, не получилось ${failed}` : ""}. Можно выбрать мультики для другого ребёнка.`);
  };

  return <div className="modal-overlay" role="presentation">
    <section className="settings-panel youtube-import" role="dialog" aria-modal="true" aria-labelledby="yt-import-title" data-testid="youtube-import" inert={busy}>
      <header className="settings-header">
        <div><p className="settings-kicker">Из вашего YouTube</p><h2 id="yt-import-title">Детские мультики, которые мы нашли</h2></div>
        <button type="button" className="icon-button" onClick={() => addedTotal ? window.location.reload() : onClose()} aria-label="Закрыть"><X aria-hidden="true" /></button>
      </header>
      <div className="settings-body">
        {candidates === null ? <p>Загружаем…</p> : !list.length
          ? <p>{addedTotal ? "Всё найденное уже добавлено." : "В лайках, плейлистах и подписках не нашлось видео, которые YouTube отмечает как детские. Можно поручить поиск своему ИИ-агенту: «Для взрослых» → «Семья» → «ИИ-агент»."}</p>
          : <>
            <p>Только видео, которые YouTube отмечает как детские. Выберите ребёнка и отметьте мультики.</p>
            <div className="profile-switcher" role="group" aria-label="Для кого">
              {family.map(f => <button type="button" key={f.id} className="profile-tab" aria-pressed={child === f.id} onClick={() => setChild(f.id)} data-testid={`yt-child-${f.id}`}><span className="profile-avatar" aria-hidden="true">{f.avatar}</span><span>{f.name}</span></button>)}
            </div>
            <p><button type="button" className="link-button" onClick={() => setChosen(chosen.size === list.length ? new Set() : new Set(list.map(c => c.videoId)))}>{chosen.size === list.length ? "Снять все" : `Выбрать все (${list.length})`}</button></p>
            <ul className="yt-candidates">
              {list.map(c => <li key={c.videoId}><button type="button" aria-pressed={chosen.has(c.videoId)} onClick={() => toggle(c.videoId)} data-testid={`yt-pick-${c.videoId}`}>
                <img src={`https://i.ytimg.com/vi/${c.videoId}/mqdefault.svg`} alt="" loading="lazy" width={160} height={90} />
                <span className="yt-copy"><strong>{c.title}</strong><span>{c.channel} · {SOURCE[c.source] ?? c.source}</span></span>
                {chosen.has(c.videoId) && <Check className="yt-check" aria-hidden="true" />}
              </button></li>)}
            </ul>
          </>}
        {message && <p className="child-status" role="status">{message}</p>}
      </div>
      <footer className="settings-footer">
        <button type="button" className="button button-quiet" onClick={() => addedTotal ? window.location.reload() : onClose()}>{addedTotal ? "Готово" : "Закрыть"}</button>
        <button type="button" className="button button-primary" disabled={!chosen.size || busy || !child} onClick={add} data-testid="yt-add">{busy ? "Добавляем…" : `Добавить ${chosen.size || ""} для ${family.find(f => f.id === child)?.name ?? ""}`}</button>
      </footer>
    </section>
  </div>;
}
