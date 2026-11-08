"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Ellipsis, LoaderCircle, Music2, Plus, Rocket, Sparkles, Truck, Tv, X } from "lucide-react";
import { CartoonVideo, TOPICS, TopicId } from "../data/catalog";

import { ProfileId, belongsToProfile, builtinName } from "../lib/profiles";

const ICONS = { stories: Tv, learning: Sparkles, vehicles: Truck, songs: Music2, adventures: Rocket };

export default function AddToLibrary({ profile, profileName = builtinName(profile), videoId, title, libraryTicket, existing, onSaved, onShowTopic }: {
  profile: ProfileId;
  profileName?: string;
  videoId: string;
  title: string;
  libraryTicket?: string;
  existing?: CartoonVideo;
  onSaved: (video: CartoonVideo, profile: ProfileId) => void;
  onShowTopic: (topic: TopicId) => void;
}) {
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [tags, setTags] = useState("");
  const [saved, setSaved] = useState<CartoonVideo>();
  const savedVideo = existing ?? saved;
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const showSaved = useRef<HTMLButtonElement>(null);
  const headingId = useId();

  // Native modal top layer avoids clipping inside the scrolling cards and traps keyboard focus.
  useEffect(() => {
    if (editing) dialog.current?.showModal();
    else if (dialog.current?.open) { dialog.current.close(); (showSaved.current ?? trigger.current)?.focus(); }
  }, [editing]);

  async function save(topicId?: TopicId) {
    if (inFlight.current || savedVideo) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    setError(false);
    try {
      if (!libraryTicket) throw new Error("Добавление пока недоступно. Обнови поиск и попробуй снова.");
      const response = await fetch("/api/library", {
        method: "POST", headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(75_000),
        body: JSON.stringify({ profile, videoId, libraryTicket, ...(topicId ? { topicId } : {}), tags: tags.split(",").map(tag => tag.trim()).filter(Boolean) }),
      });
      const result = await response.json() as { status?: string; video?: CartoonVideo; error?: string; code?: string; manualAllowed?: boolean };
      if (!response.ok) {
        if (result.manualAllowed) {
          setEditing(true);
          setMessage(result.code === "category_required" ? "Выбери, куда положить видео." : "Не получилось выбрать раздел автоматически. Нажми на подходящую картинку.");
          return;
        }
        throw new Error(result.error || "Не получилось добавить. Попробуй ещё раз.");
      }
      if (!result.video || result.video.id !== videoId || !belongsToProfile(result.video, profile) || !TOPICS.some(item => item.id === result.video?.topicId)) throw new Error("Не получилось проверить сохранение. Попробуй ещё раз.");
      setSaved(result.video);
      setEditing(false);
      setMessage(`${result.status === "duplicate" ? "Уже в списке" : "Добавлено"} · ${profileName} · ${TOPICS.find(item => item.id === result.video?.topicId)?.shortTitle}`);
      onSaved(result.video, profile);
    } catch (failure) {
      setError(true);
      setMessage(failure instanceof Error && failure.name !== "TimeoutError" && failure.name !== "TypeError" ? failure.message : "Связь прервалась. Попробуй ещё раз.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <div className="kids-library-action" data-testid={`library-action-${videoId}`}>
    <button ref={trigger} type="button" className="kids-library-add" data-saved={savedVideo ? "true" : undefined} disabled={busy || !!savedVideo} onClick={() => void save()}>
      {busy ? <LoaderCircle className="spin" aria-hidden="true" /> : savedVideo ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
      {busy ? "Добавляем" : savedVideo ? `У ${profileName}` : `В список ${profileName}`}
    </button>
    {!savedVideo && <button type="button" className="kids-library-options" disabled={busy} onClick={() => { setMessage(""); setError(false); setEditing(true); }} aria-label={`Выбрать раздел для ${title}`} aria-haspopup="dialog"><Ellipsis aria-hidden="true" /></button>}
    {!editing && message && <p className="kids-library-message" role={error ? "alert" : "status"}>{message}</p>}
    {savedVideo && <button ref={showSaved} type="button" className="kids-library-show" onClick={() => onShowTopic(savedVideo.topicId)}>Показать в меню</button>}
    <dialog ref={dialog} className="kids-save-sheet" aria-labelledby={headingId} onCancel={event => { event.preventDefault(); if (!busy) setEditing(false); }} onClick={event => { if (event.target === event.currentTarget && !busy) setEditing(false); }}>
      <div className="kids-save-content">
        <header><h2 id={headingId}>Куда добавим?</h2><button type="button" autoFocus disabled={busy} onClick={() => setEditing(false)} aria-label="Закрыть выбор раздела"><X aria-hidden="true" /></button></header>
        <p className="kids-save-title">В список {profileName} · {title}</p>
        {message && <p className="kids-library-message" role={error ? "alert" : "status"}>{message}</p>}
        <div className="kids-save-topics">
          {TOPICS.map(item => {
            const Icon = ICONS[item.id];
            return <button type="button" key={item.id} className={`category-${item.id}`} disabled={busy} onClick={() => void save(item.id)}><Icon aria-hidden="true" /><span>{item.id === "stories" ? "Мультики" : item.shortTitle}</span><Plus aria-hidden="true" /></button>;
          })}
        </div>
        {busy && <p role="status">Добавляем видео...</p>}
        <details className="kids-save-details"><summary>Теги для поиска</summary><label>Теги через запятую<input value={tags} onChange={event => setTags(event.target.value)} placeholder="поезда, английский" maxLength={410} disabled={busy} /><small>Необязательно. До 10 тегов, каждый до 40 символов.</small></label></details>
      </div>
    </dialog>
  </div>;
}
