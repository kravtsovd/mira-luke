"use client";

import { useEffect, useState } from "react";
import { LogOut, Trash2, UserPlus } from "lucide-react";
import { Account } from "./useAccount";
import GoogleSignInButton from "./GoogleSignInButton";
import AgentKeysSection from "./AgentKeysSection";

export default function AccountSection({ account, onSignOut }: { account: Account; onSignOut: () => void }) {
  const [parents, setParents] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!account.signedIn) return;
    let alive = true;
    fetch("/api/family/parents", { cache: "no-store" }).then(response => response.json()).then(payload => {
      if (alive && Array.isArray(payload.parents)) setParents(payload.parents);
    }).catch(() => { if (alive) setError("Не удалось загрузить список взрослых."); });
    return () => { alive = false; };
  }, [account.signedIn]);

  const change = async (method: "POST" | "DELETE", value: string) => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/family/parents", { method, headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify({ email: value }) });
      const payload = await response.json();
      if (!response.ok) setError(payload.error ?? "Не получилось. Попробуйте ещё раз.");
      else { setParents(payload.parents); if (method === "POST") setEmail(""); }
    } catch { setError("Нет связи с сервером. Попробуйте ещё раз."); }
    finally { setBusy(false); }
  };

  if (!account.signedIn) {
    return <section className="settings-section account-section" aria-labelledby="account-title" data-testid="account-section">
      <h3 id="account-title">Вход для родителей</h3>
      <p>Войдите через Google, чтобы открыть профили своей семьи на любом устройстве. При первом входе создаётся отдельная семья.</p>
      {account.googleConfigured
        ? <GoogleSignInButton testId="sign-in-settings" />
        : <p className="settings-validation">Вход через Google ещё не включён.</p>}
    </section>;
  }

  return <section className="settings-section account-section" aria-labelledby="account-title" data-testid="account-section" inert={busy}>
    <h3 id="account-title">Семья{account.family?.name ? ` · ${account.family.name}` : ""}</h3>
    <p>Вы вошли как <strong data-testid="signed-in-email">{account.email}</strong>. <button type="button" className="link-button" onClick={onSignOut} data-testid="sign-out"><LogOut aria-hidden="true" className="inline-icon" />Выйти</button></p>
    <h4>Взрослые</h4>
    <p>Эти Google-аккаунты открывают вашу семью: детей, мультики и настройки.</p>
    <ul className="child-profile-list" data-testid="parents-list">
      {parents.map(parent => <li key={parent}><span className="child-copy"><strong>{parent}</strong>{parent === account.email && <span>Это вы</span>}</span>
        {parent !== account.email && <button type="button" className="icon-button" aria-label={`Убрать ${parent}`} onClick={() => void change("DELETE", parent)}><Trash2 aria-hidden="true" /></button>}
      </li>)}
    </ul>
    <form className="parent-add" onSubmit={event => { event.preventDefault(); void change("POST", email); }}>
      <input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.test" aria-label="Email взрослого" data-testid="parent-email" required />
      <button type="submit" className="button" data-testid="parent-add"><UserPlus aria-hidden="true" />Добавить</button>
    </form>
    {error && <p className="settings-validation" role="alert">{error}</p>}
    {account.youtubeImport && <div className="agent-keys" data-testid="youtube-connect-section">
      <h4>Мультики из вашего YouTube</h4>
      <p>Посмотрим лайки, подписки и плейлисты, оставим только то, что YouTube отмечает как детское, и предложим добавить детям. Доступ только на чтение и только на один раз.</p>
      <a className="button" href="/api/youtube/connect" data-testid="youtube-connect">Подключить YouTube</a>
    </div>}
    <AgentKeysSection />
  </section>;
}
