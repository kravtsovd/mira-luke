"use client";

import { useEffect, useState } from "react";
import { Bot, Copy, KeyRound, Trash2 } from "lucide-react";
import { agentInstructions } from "../lib/agent-instructions";

interface AgentKey { id: string; label: string; prefix: string; createdBy: string; createdAt: string; lastUsedAt: string | null }
const day = (value: string | null) => value ? new Date(value).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) : "ещё не использовался";

export default function AgentKeysSection() {
  const [keys, setKeys] = useState<AgentKey[]>([]);
  const [instruction, setInstruction] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/family/agent-keys", { cache: "no-store" }).then(response => response.json())
      .then(payload => { if (alive && Array.isArray(payload.keys)) setKeys(payload.keys); })
      .catch(() => { if (alive) setError("Не удалось загрузить ключи."); });
    return () => { alive = false; };
  }, []);

  const call = async (method: "POST" | "DELETE", body: object) => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/family/agent-keys", { method, headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) { setError(payload.error ?? "Не получилось. Попробуйте ещё раз."); return null; }
      return payload;
    } catch { setError("Нет связи с сервером."); return null; }
    finally { setBusy(false); }
  };

  const create = async () => {
    const payload = await call("POST", { label: "Мой агент" });
    if (!payload) return;
    setKeys(current => [...current, payload.record]);
    setInstruction(agentInstructions(window.location.origin, payload.key));
    setCopied(false);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(instruction); setCopied(true); }
    catch { setError("Браузер не дал скопировать. Выделите текст и скопируйте вручную."); }
  };

  return <div className="agent-keys" data-testid="agent-keys" inert={busy}>
    <h4><Bot aria-hidden="true" className="inline-icon" />ИИ-агент</h4>
    <p>Ваш агент (Claude, ChatGPT, Codex) может сам найти в вашем YouTube, что смотрят дети, предложить список и после вашего «да» добавить мультики в их библиотеку. Он видит только вашу семью.</p>
    {instruction
      ? <div className="agent-instruction">
        <p><strong>Скопируйте и отправьте агенту.</strong> Ключ внутри показывается один раз.</p>
        <textarea readOnly value={instruction} rows={10} data-testid="agent-instruction" onFocus={event => event.currentTarget.select()} />
        <button type="button" className="button button-primary" onClick={copy} data-testid="agent-copy"><Copy aria-hidden="true" />{copied ? "Скопировано" : "Скопировать инструкцию"}</button>
      </div>
      : <button type="button" className="button" onClick={create} data-testid="agent-create"><KeyRound aria-hidden="true" />Создать ключ и инструкцию</button>}
    {keys.length > 0 && <ul className="child-profile-list" data-testid="agent-key-list">
      {keys.map(key => <li key={key.id}><span className="child-copy"><strong>{key.label} · {key.prefix}…</strong><span>создал {key.createdBy}, {day(key.createdAt)}; последний раз: {day(key.lastUsedAt)}</span></span>
        <button type="button" className="icon-button" aria-label={`Отозвать ключ ${key.prefix}`} data-testid={`agent-revoke-${key.prefix}`}
          onClick={async () => { const payload = await call("DELETE", { id: key.id }); if (payload) setKeys(payload.keys); }}><Trash2 aria-hidden="true" /></button>
      </li>)}
    </ul>}
    <p className="agent-docs">Как это работает: <a href="/agent" target="_blank" rel="noreferrer">инструкция для агента</a>.</p>
    {error && <p className="settings-validation" role="alert">{error}</p>}
  </div>;
}
