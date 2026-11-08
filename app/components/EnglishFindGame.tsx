"use client";

import { useEffect, useRef, useState } from "react";
import { Star, Volume2, X } from "lucide-react";
import { preloadVoices, speakRussian, stopSpeaking } from "../lib/speech";
import { voiceDelay } from "../lib/voice-timing";
import { track } from "../lib/analytics";
import {
  EnglishProgress, LEVELS, LevelNumber, LEVEL_UP_PHRASE, MASTERED_PHRASE, freshProgress, roundsToPass, Placed, ROUND_NO_STAR_PHRASE, STARS_TO_PASS, TASKS_PER_BREAK, Target, Task,
  findPhrase, makeTask, readEnglishProgress, rightPhrase, roundStarPhrase, saveEnglishProgress, scoreRound, targetKey, targetWords, wrongPhrase,
} from "../lib/english-find";
import { loadSharedEnglishProgress, newRoundId, queueEnglishRound } from "../lib/english-progress-sync";
import useGameAnalytics from "./useGameAnalytics";
import "./english-find.css";

const ART = "/images/english-farm";
const imageFor = (target: Target) => target.kind === "item" ? `${ART}/${target.item}-${target.color}.svg` : `${ART}/${target.animal}.svg`;

function Sticker({ target }: { target: Target }) {
  if (target.kind !== "group") return <img src={imageFor(target)} alt="" draggable={false} />;
  // Three animals stand as a little pyramid so the group stays compact on the lawn.
  const rows = target.count === 3 ? [1, 2] : [target.count];
  return <span className="ef-group" data-count={target.count}>
    {rows.map((size, row) => <span key={row} className="ef-group-row">
      {Array.from({ length: size }, (_, index) => <img key={index} src={imageFor(target)} alt="" draggable={false} />)}
    </span>)}
  </span>;
}

type Summary = { clean: boolean; stars: number; levelUp: boolean; nextLevel: number; mastered: boolean; phrase: string; level: number; good: number; bad: number };

export default function EnglishFindGame({ soundEnabled, onSolved, onComplete, practice }: {
  soundEnabled: boolean;
  onSolved: () => void;
  onComplete: () => void;
  practice?: { level?: LevelNumber; onLevelChange?: (level: LevelNumber) => void };
}) {
  const [progress, setProgress] = useState<EnglishProgress>(() => {
    const saved = readEnglishProgress();
    return practice?.level ? freshProgress(practice.level) : saved;
  });
  const [task, setTask] = useState<Task>(() => makeTask(progress.level));
  const [done, setDone] = useState(0);
  const [phase, setPhase] = useState<"find" | "found" | "summary">("find");
  const [wrong, setWrong] = useState<{ key: string; words: string } | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [roundMistakes, setRoundMistakes] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const analytics = useGameAnalytics("english-find", { game_variant: "farm-find-v2-round-stars", launch_date: "2026-10-02", level_id: task.levelId, level: task.level, test_mode: Boolean(practice) });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const locked = useRef(false);
  const touched = useRef(false);
  const title = useRef<HTMLHeadingElement>(null);
  const prompt = findPhrase(task.target);

  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    title.current?.focus({ preventScroll: true });
    return () => {
      timers.current.forEach(clearTimeout);
      document.body.style.overflow = previousOverflow;
      stopSpeaking();
      previousFocus?.focus();
    };
  }, []);

  // Another iPad or phone may have moved Mira on since this device last played: take the shared copy if the child
  // has not tapped yet. A test run with a chosen level keeps its own level.
  useEffect(() => {
    if (practice?.level) return;
    let alive = true;
    void loadSharedEnglishProgress().then(shared => {
      if (!alive || !shared || touched.current) return;
      setProgress(shared);
      setTask(current => current.level === shared.level ? current : makeTask(shared.level));
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    preloadVoices([prompt, rightPhrase(task.target), ...task.scene.filter(item => item.key !== targetKey(task.target)).map(item => wrongPhrase(item.target))]);
    if (phase === "find") speakRussian(prompt, soundEnabled);
  }, [task]);

  function endRound(praise: string, cleanRound: boolean) {
    const scored = scoreRound(progress, cleanRound);
    if (!practice) {
      saveEnglishProgress(scored.progress);
      void queueEnglishRound({ id: newRoundId(), level: task.level, clean: cleanRound });
    }
    else if (scored.levelUp) practice.onLevelChange?.(scored.progress.level);
    const top = scored.progress.mastered && task.level === 4;
    const phrase = scored.reason === "stars" ? (top ? MASTERED_PHRASE : LEVEL_UP_PHRASE)
      : cleanRound ? roundStarPhrase(roundsToPass(scored.progress)) : ROUND_NO_STAR_PHRASE;
    const stats = scored.progress.levels[task.level];
    track("game_round_scored", { game: "english-find", test_mode: Boolean(practice), level_id: task.levelId, level: task.level, clean: cleanRound, mistakes: roundMistakes, stars_before: progress.stars, stars_after: scored.progress.stars, streak_after: scored.progress.streak, level_up: scored.levelUp, level_up_reason: scored.reason, level_clean_rounds: stats.clean, level_miss_rounds: stats.miss });
    if (scored.levelUp) track("game_level_up", { game: "english-find", test_mode: Boolean(practice), level_id: task.levelId, level: task.level, next_level: scored.progress.level, mastered: scored.progress.mastered });
    analytics.complete();
    // Resume during the child's gesture so strict mobile browsers accept playback.
    onSolved();
    later(() => {
      setSummary({ clean: cleanRound, stars: scored.levelUp ? STARS_TO_PASS : scored.progress.stars, levelUp: scored.levelUp, nextLevel: scored.progress.level, mastered: scored.progress.mastered, phrase, level: task.level, good: stats.clean, bad: stats.miss });
      setProgress(scored.progress);
      setPhase("summary");
      speakRussian(phrase, soundEnabled);
      later(onComplete, voiceDelay(phrase, soundEnabled, 3600) + 600);
    }, voiceDelay(praise, soundEnabled, 1400));
  }

  function jump(level: LevelNumber, stars = 0) {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    locked.current = false;
    setProgress(freshProgress(level, stars));
    setDone(0); setMistakes(0); setRoundMistakes(0); setWrong(null); setSummary(null); setPhase("find");
    setTask(makeTask(level));
    practice?.onLevelChange?.(level);
  }

  function choose(item: Placed) {
    if (locked.current || phase !== "find") return;
    touched.current = true;
    const correct = item.key === targetKey(task.target);
    analytics.answer(correct, "tap", { target: targetKey(task.target), chosen: item.key, first_try: mistakes === 0, round_task: done + 1, stars_before: progress.stars });
    if (!correct) {
      setMistakes(value => value + 1);
      setRoundMistakes(value => value + 1);
      setWrong({ key: item.key, words: targetWords(item.target) });
      speakRussian(wrongPhrase(item.target), soundEnabled);
      later(() => setWrong(null), 1600);
      later(() => { if (!locked.current) speakRussian(prompt, soundEnabled); }, voiceDelay(wrongPhrase(item.target), soundEnabled, 1300));
      return;
    }

    locked.current = true;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setWrong(null);
    const praise = rightPhrase(task.target);
    speakRussian(praise, soundEnabled);
    setPhase("found");
    if (done + 1 >= TASKS_PER_BREAK) { endRound(praise, roundMistakes === 0); return; }
    later(() => {
      setDone(value => value + 1);
      setMistakes(0);
      setPhase("find");
      setTask(makeTask(progress.level, Math.random, targetKey(task.target)));
      locked.current = false;
    }, voiceDelay(praise, soundEnabled, 1600));
  }

  return <div className="ef-overlay" role="dialog" aria-modal="true" aria-labelledby="ef-title"
    data-testid="english-find-game" data-level={task.level} data-phase={phase} data-target={targetKey(task.target)}
    onContextMenu={event => event.preventDefault()} onDragStart={event => event.preventDefault()}
    onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onComplete(); } }}>
    <section className="ef-stage" style={{ backgroundImage: `url(${ART}/meadow.svg)` }}>
      <header className="ef-top">
        <div className="ef-stars" aria-label={`Уровень ${task.level}, ${progress.stars} из ${STARS_TO_PASS} звёзд`} data-testid="english-stars" data-stars={progress.stars}>
          {practice && <span className="ef-test" data-testid="english-test-badge">Тест</span>}
          <span className="ef-level">Level {task.level}</span>
          {Array.from({ length: STARS_TO_PASS }, (_, index) => <Star key={index} data-on={index < progress.stars} aria-hidden="true" />)}
        </div>
        {practice && <div className="ef-practice" aria-label="Проверка взрослым: звёзды Миры не меняются">
          {LEVELS.map(({ level }) => <button type="button" key={level} data-active={level === task.level} data-testid={`practice-level-${level}`}
            onClick={() => jump(level as LevelNumber)}>{level}</button>)}
          <button type="button" data-testid="practice-one-star-left" onClick={() => jump(task.level, STARS_TO_PASS - 1)}>{STARS_TO_PASS - 1}★</button>
        </div>}
        <div className="ef-round" aria-label={`Задание ${Math.min(done + 1, TASKS_PER_BREAK)} из ${TASKS_PER_BREAK}`} data-testid="english-round">
          {Array.from({ length: TASKS_PER_BREAK }, (_, index) => <span key={index}
            data-done={index < done || (index === done && phase !== "find")} data-current={index === done && phase === "find"}
            data-miss={roundMistakes > 0 && (index < done || (index === done && phase !== "find"))} />)}
        </div>
        <button type="button" className="ef-close" aria-label="Закрыть игру" onClick={onComplete}><X /></button>
      </header>

      <div className="ef-prompt">
        <h2 id="ef-title" tabIndex={-1} ref={title} lang="en">{phase === "find" ? prompt : rightPhrase(task.target)}</h2>
        <button type="button" className="ef-repeat" aria-label="Повторить задание" disabled={!soundEnabled || phase !== "find"}
          onClick={() => { analytics.repeatInstruction(); speakRussian(prompt, soundEnabled); }}><Volume2 /></button>
      </div>

      {task.scene.map(item => {
        const isTarget = item.key === targetKey(task.target);
        return <button type="button" key={item.key} className="ef-sticker" lang="en"
          style={{ left: `${item.left}%`, top: `${item.top}%`, height: `${item.height}%` }}
          data-testid={`sticker-${item.key}`} data-wrong={wrong?.key === item.key} data-found={phase !== "find" && isTarget}
          data-hint={mistakes >= 2 && isTarget && phase === "find"} aria-label={targetWords(item.target)}
          onClick={() => choose(item)}>
          <Sticker target={item.target} />
          {wrong?.key === item.key && <span className="ef-bubble">{wrong.words}</span>}
        </button>;
      })}

      {summary && <div className="ef-celebrate" role="status" data-testid="english-summary" data-clean={summary.clean} data-level-up={summary.levelUp}>
        <div className="ef-burst" data-testid="english-summary-stars" data-stars={summary.stars}>
          {Array.from({ length: STARS_TO_PASS }, (_, index) => <Star key={index} data-on={index < summary.stars}
            data-new={summary.clean && index === summary.stars - 1} style={{ "--i": index } as React.CSSProperties} />)}
        </div>
        <p className="ef-summary-title">{summary.levelUp ? (summary.mastered ? "Вся ферма!" : `Новая игра: Level ${summary.nextLevel}!`) : `${summary.stars} из ${STARS_TO_PASS}`}</p>
        <p className="ef-summary-text">{summary.phrase}</p>
        <p className="ef-summary-stats" data-testid="english-summary-stats">Level {summary.level}: удачных раундов {summary.good}, неудачных {summary.bad}</p>
      </div>}
    </section>
  </div>;
}
