"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Volume2, X } from "lucide-react";
import { track } from "../lib/analytics";
import { BUILD_NAME_PROMPT, NAME_CARDS, NAME_GAME_ANALYTICS, NameCard, nameTiles, ROUND_SIZE, SYLLABLES_GAME } from "../lib/huntrix";
import { chooseNameRound, readNameProgress, recordNameResult } from "../lib/huntrix-progress";
import { preloadVoices, speakRussian, stopSpeaking } from "../lib/speech";
import useGameAnalytics from "./useGameAnalytics";
import "./huntrix.css";

type Step = { card: NameCard; tiles: string[]; started: number };

function makeStep(card: NameCard): Step {
  return { card, tiles: nameTiles(card), started: performance.now() };
}

const NEXT_STEP_MS = 1300, FINISH_MS = 1400, RESET_FEEDBACK_MS = 800;
export default function HuntrixSyllablesGame({ soundEnabled, onSolved, onComplete }: {
  soundEnabled: boolean; onSolved?: () => void; onComplete: () => void;
}) {
  const analytics = useGameAnalytics(SYLLABLES_GAME, NAME_GAME_ANALYTICS);
  const [order, setOrder] = useState<NameCard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<Step | null>(null);
  const [placed, setPlaced] = useState(0);
  const [wrong, setWrong] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [built, setBuilt] = useState(0);

  const title = useRef<HTMLHeadingElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stepErrors = useRef(0);
  const inputLocked = useRef(false);
  const nameAttempt = useRef(1);
  const finish = useRef(onComplete);
  finish.current = onComplete;
  const done = built === ROUND_SIZE;
  const syllables: readonly string[] = step?.card.syllables ?? [];
  const nameReady = step !== null && placed === syllables.length;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Shuffle after hydration so the server and first client render show the same screen.
    preloadVoices([...new Set(NAME_CARDS.flatMap(card => [...card.syllables]))].map(syllable => syllable.toLowerCase()));
    const cards = chooseNameRound(readNameProgress());
    setOrder(cards);
    setStep(makeStep(cards[0]));
    return () => {
      document.body.style.overflow = overflow;
      timers.current.forEach(clearTimeout);
      stopSpeaking(); previous?.focus();
    };
  }, []);

  useEffect(() => {
    if (!step) return;
    title.current?.focus({ preventScroll: true });
    speakRussian(BUILD_NAME_PROMPT, soundEnabled);
    return stopSpeaking;
  }, [step, soundEnabled]);

  function choose(tile: string) {
    if (inputLocked.current || !step || !order || nameReady || done) return;
    const expected = syllables[placed];
    const success = tile === expected;
    speakRussian(tile.toLowerCase(), soundEnabled);
    analytics.answer(success, "syllable_tap", {
      category: step.card.category, slot: placed + 1, hinted: false, name_attempt: nameAttempt.current,
    });
    if (!success) {
      stepErrors.current += 1;

      inputLocked.current = true;
      setResetting(true);
      setPlaced(0);
      setWrong(tile);
      nameAttempt.current += 1;
      timers.current.push(setTimeout(() => {
        setStep(current => current ? { ...current, tiles: nameTiles(current.card) } : null);
        setWrong(null);
        setResetting(false);
        inputLocked.current = false;
      }, RESET_FEEDBACK_MS));
      return;
    }
    setWrong(null);
    const nextPlaced = placed + 1;
    setPlaced(nextPlaced);
    if (nextPlaced < syllables.length) return;

    inputLocked.current = true;

    track("game_step_completed", {
      game: SYLLABLES_GAME, category: step.card.category, step: index + 1, errors: stepErrors.current,
      step_seconds: Math.round((performance.now() - step.started) / 1000), ...NAME_GAME_ANALYTICS,
    });
    recordNameResult(step.card.id, stepErrors.current);
    stepErrors.current = 0;
    const nextBuilt = built + 1;
    setBuilt(nextBuilt);
    if (nextBuilt === ROUND_SIZE) {
      analytics.complete();
      onSolved?.();
      timers.current.push(setTimeout(() => finish.current(), FINISH_MS));
      return;
    }
    timers.current.push(setTimeout(() => {
      setIndex(index + 1);
      setPlaced(0);
      nameAttempt.current = 1;
      setStep(makeStep(order[index + 1]));
      inputLocked.current = false;
    }, NEXT_STEP_MS));
  }

  const feedback = done ? "Все имена собраны!"
    : nameReady ? `Это ${step?.card.name}!`
    : resetting ? "Попробуем имя сначала"
    : placed === 0 ? "Какой слог первый?" : "Теперь следующий слог";

  return <div ref={root} className="huntrix-overlay" role="dialog" aria-modal="true" aria-labelledby="huntrix-title" data-testid="huntrix-game" data-mode="syllables"
    onKeyDown={event => {
      if (event.key === "Escape") { event.stopPropagation(); onComplete(); }
      if (event.key !== "Tab") return;
      const buttons = Array.from(root.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === title.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
    <section className="huntrix-game syllables-game">
      <header className="huntrix-toolbar">
        <div className="huntrix-progress" aria-label={`Собрано ${built} из ${ROUND_SIZE}`}>
          {Array.from({ length: ROUND_SIZE }, (_, i) => <span key={i} data-filled={i < built} aria-hidden="true">{i < built ? <Check /> : null}</span>)}
        </div>
        <button type="button" className="huntrix-close" aria-label="Закрыть игру" onClick={onComplete}><X /></button>
      </header>

      <div className="huntrix-prompt">
        <h2 id="huntrix-title" ref={title} tabIndex={-1}>{done ? "Молодец, Мира!" : "Собери имя"}</h2>
        <p>Нажимай слоги по порядку</p>
        <button type="button" className="huntrix-repeat" aria-label="Повторить задание" disabled={!soundEnabled || done}
          onClick={() => { analytics.repeatInstruction(); speakRussian(BUILD_NAME_PROMPT, soundEnabled); }}><Volume2 /></button>
      </div>

      {step && <div className="syllables-stage" key={step.card.id}>
        <div className="syllables-portrait" data-correct={nameReady}>
          <img src={step.card.image} alt={step.card.description} draggable={false} data-card={step.card.id} />
        </div>
        <div className="syllables-work">
          <div className="syllables-slots" role="group" aria-label="Имя" data-testid="name-slots" data-ready={nameReady}>
            {syllables.map((syllable, slot) => <span key={slot} className="syllables-slot" data-testid={`slot-${slot + 1}`}
              data-filled={slot < placed} data-next={slot === placed && !nameReady}>
              {slot < placed ? syllable : ""}
            </span>)}
            {nameReady && <Check className="syllables-check" aria-hidden="true" />}
          </div>
          <div className="syllables-tray" role="group" aria-label="Слоги">
            {step.tiles.map((tile, tileIndex) => <button key={tileIndex} type="button" className="syllables-tile" data-testid={`tile-${tile}-${tileIndex}`}
              disabled={resetting || nameReady} data-wrong={wrong === tile}
              onClick={() => choose(tile)}>{tile}</button>)}
          </div>
        </div>
      </div>}
      <p className="huntrix-feedback" role="status">{feedback}</p>
    </section>
  </div>;
}
