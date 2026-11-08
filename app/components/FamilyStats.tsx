"use client";

import { useEffect, useMemo, useState } from "react";
import { ChildProfile, ProfileId } from "../lib/profiles";

interface DayStats { date: string; minutes: number; videos: number; rounds: number; answers: number; correct: number }
interface GameStats {
  game: string; title: string; rounds: number; answers: number; accuracy: number | null; errorsPerRound: number | null;
  recentSeconds: number | null; earlierSeconds: number | null; daysPlayed: number; lastPlayed: string | null;
}
interface VideoStats { id: string; title: string | null; minutes: number; starts: number }
interface ChildStats { profile: string; minutes: number; rounds: number; days: DayStats[]; games: GameStats[]; videos: VideoStats[] }
interface FamilyStatsPayload { generatedAt: string; days: number; timezone: string; children: ChildStats[] }

type State = { status: "loading" } | { status: "ready"; stats: FamilyStatsPayload } | { status: "error"; message: string };

const DAY = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "America/Los_Angeles" });
const WEEKDAY = new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: "America/Los_Angeles" });
const WHEN = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Los_Angeles" });
const asDate = (date: string) => new Date(`${date}T12:00:00Z`);

export function formatMinutes(minutes: number): string {
  const total = Math.round(minutes);
  if (total < 60) return `${total} мин`;
  return `${Math.floor(total / 60)} ч ${total % 60 ? `${total % 60} мин` : ""}`.trim();
}

/** Lower round time is better; a change under 15% is noise for a child's game. */
function trend(game: GameStats): "better" | "worse" | null {
  if (game.recentSeconds === null || game.earlierSeconds === null || game.earlierSeconds <= 0) return null;
  const change = (game.recentSeconds - game.earlierSeconds) / game.earlierSeconds;
  if (Math.abs(change) < 0.15) return null;
  return change < 0 ? "better" : "worse";
}

export default function FamilyStats({ family, active }: { family: ChildProfile[]; active: ProfileId }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [selected, setSelected] = useState<ProfileId>(active);

  useEffect(() => {
    let alive = true;
    fetch("/api/family/stats", { cache: "no-store" }).then(async response => {
      const payload = await response.json().catch(() => ({}));
      if (!alive) return;
      if (response.ok && Array.isArray(payload.children)) setState({ status: "ready", stats: payload });
      else setState({ status: "error", message: payload.error ?? "Не удалось получить статистику." });
    }).catch(() => { if (alive) setState({ status: "error", message: "Нет связи с сервером. Попробуйте ещё раз." }); });
    return () => { alive = false; };
  }, []);

  const names = useMemo(() => new Map(family.map(child => [child.id, child])), [family]);
  const children = state.status === "ready" ? state.stats.children.filter(child => names.has(child.profile)) : [];
  const current = children.find(child => child.profile === selected) ?? children[0];

  return <section className="settings-section family-stats" aria-labelledby="family-stats-title" data-testid="family-stats">
    <h3 id="family-stats-title">Статистика{state.status === "ready" ? ` за ${state.stats.days} дней` : ""}</h3>
    {state.status === "loading" && <p>Загружаем статистику…</p>}
    {state.status === "error" && <p className="settings-validation" role="alert">{state.message}</p>}
    {state.status === "ready" && !current && <p>Пока нечего показать: дети этой семьи ещё не смотрели мультики.</p>}
    {current && <>
      {children.length > 1 && <div className="stats-tabs" role="tablist" aria-label="Чья статистика">
        {children.map(child => <button key={child.profile} type="button" role="tab" aria-selected={child.profile === current.profile}
          onClick={() => setSelected(child.profile)} data-testid={`stats-tab-${child.profile}`}>
          <span aria-hidden="true">{names.get(child.profile)?.avatar}</span>{names.get(child.profile)?.name ?? child.profile}
        </button>)}
      </div>}
      <ChildStatsView child={current} />
      <p className="stats-note">Считаются только игры, которые открылись сами во время мультика, днём. Игры, запущенные взрослыми кнопкой, не учитываются. Данные обновляются раз в 10 минут.</p>
    </>}
  </section>;
}

function ChildStatsView({ child }: { child: ChildStats }) {
  const peak = Math.max(1, ...child.days.map(day => day.minutes));
  return <div className="stats-child" data-testid="stats-child">
    <div className="stats-totals">
      <div><strong data-testid="stats-minutes">{formatMinutes(child.minutes)}</strong><span>мультиков</span></div>
      <div><strong data-testid="stats-rounds">{child.rounds}</strong><span>раундов в играх</span></div>
      <div><strong>{child.days.filter(day => day.minutes > 0 || day.rounds > 0).length}</strong><span>дней с игрой или мультиком</span></div>
    </div>

    <h4>Мультики по дням</h4>
    <ol className="stats-days" aria-label="Минуты мультиков по дням">
      {child.days.map(day => <li key={day.date} title={`${DAY.format(asDate(day.date))}: ${formatMinutes(day.minutes)}, раундов ${day.rounds}`}>
        <span className="stats-bar" style={{ height: `${Math.max(day.minutes > 0 ? 6 : 0, (day.minutes / peak) * 100)}%` }} />
        <span className="stats-day-label">{asDate(day.date).getUTCDate()}<small>{WEEKDAY.format(asDate(day.date))}</small></span>
      </li>)}
    </ol>

    <h4>Игры</h4>
    {child.games.length === 0
      ? <p>Игр за эти дни не было.</p>
      : <ul className="stats-games" data-testid="stats-games">
        {child.games.map(game => {
          const direction = trend(game);
          return <li key={game.game}>
            <div className="stats-game-title"><strong>{game.title}</strong>{game.daysPlayed <= 2 && <span className="stats-badge">новая</span>}
              <span className="stats-when">{game.lastPlayed ? WHEN.format(new Date(game.lastPlayed)) : ""}</span></div>
            <dl>
              <div><dt>Раундов</dt><dd>{game.rounds}</dd></div>
              <div><dt>Верно</dt><dd>{game.accuracy === null ? "-" : `${Math.round(game.accuracy * 100)}%`}</dd></div>
              <div><dt>Ошибок за раунд</dt><dd>{game.errorsPerRound === null ? "-" : game.errorsPerRound.toLocaleString("ru-RU")}</dd></div>
              <div><dt>Время раунда</dt><dd>
                {game.recentSeconds === null ? (game.earlierSeconds === null ? "-" : `было ${Math.round(game.earlierSeconds)} с`) : `${Math.round(game.recentSeconds)} с`}
                {direction && game.earlierSeconds !== null && <span className={`stats-trend ${direction}`}>{direction === "better" ? "↓" : "↑"} было {Math.round(game.earlierSeconds)} с</span>}
              </dd></div>
            </dl>
          </li>;
        })}
      </ul>}

    {child.videos.length > 0 && <>
      <h4>Что смотрели больше всего</h4>
      <ul className="stats-videos">
        {child.videos.map(video => <li key={video.id}>
          {/* eslint-disable-next-line @next/next/no-img-element -- YouTube thumbnails are tiny remote images. */}
          <img src={`https://i.ytimg.com/vi/${encodeURIComponent(video.id)}/default.svg`} alt="" width={64} height={48} loading="lazy" />
          <span className="child-copy"><strong>{video.title ?? "Видео с YouTube"}</strong><span>{formatMinutes(video.minutes)} · запусков {video.starts}</span></span>
        </li>)}
      </ul>
    </>}
  </div>;
}
