"use client";

import { useState } from "react";
import { Bot, Library, MonitorPlay } from "lucide-react";
import AgentKeysSection from "./AgentKeysSection";

export default function WelcomeLibrary({ familyName, youtubeImport, onDone }: { familyName?: string; youtubeImport: boolean; onDone: () => void }) {
  const [agent, setAgent] = useState(false);
  return <div className="family-onboarding" role="dialog" aria-modal="true" aria-labelledby="welcome-library-title" data-testid="welcome-library"><div>
    <p className="settings-kicker">Шаг 2 из 2{familyName ? ` · ${familyName}` : ""}</p>
    <h2 id="welcome-library-title">Откуда взять мультики?</h2>
    <p>Общий каталог уже есть: мультики, песни, техника и обучение. Добавьте к нему то, что ваши дети любят.</p>
    <div className="welcome-options">
      {youtubeImport && <a className="welcome-option" href="/api/youtube/connect" data-testid="welcome-youtube">
        <MonitorPlay aria-hidden="true" /><strong>Подключить YouTube</strong>
        <span>Посмотрим ваши лайки, подписки и плейлисты, оставим только детское и предложим добавить. Ничего не добавится без вашего выбора.</span>
      </a>}
      <button type="button" className="welcome-option" onClick={() => setAgent(true)} aria-expanded={agent} data-testid="welcome-agent">
        <Bot aria-hidden="true" /><strong>Поручить своему ИИ-агенту</strong>
        <span>Claude, ChatGPT или Codex сам найдёт в вашем YouTube, что смотрят дети, и после вашего «да» добавит в их библиотеку.</span>
      </button>
      <button type="button" className="welcome-option" onClick={onDone} data-testid="welcome-catalog">
        <Library aria-hidden="true" /><strong>Начать с общего каталога</strong>
        <span>Можно вернуться к этому позже: «Для взрослых» → «Семья».</span>
      </button>
    </div>
    {agent && <AgentKeysSection />}
    {agent && <p><button type="button" className="button button-primary" onClick={onDone} data-testid="welcome-done">Готово, к мультикам</button></p>}
  </div></div>;
}
