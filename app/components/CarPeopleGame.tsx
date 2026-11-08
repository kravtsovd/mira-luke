"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, X } from "lucide-react";
import { preloadVoices, speakRussian, stopSpeaking } from "../lib/speech";
import { voiceDelay } from "../lib/voice-timing";
import {
  CAR_PEOPLE_ANALYTICS, CAR_PEOPLE_CHOICES, CAR_PEOPLE_COUNTS, CAR_PEOPLE_ROUNDS, CarPeopleCount as Count, createCarPeopleOrder,
} from "../lib/car-people";
import useGameAnalytics from "./useGameAnalytics";
import "./car-people.css";

const CAR_COLORS = ["red", "yellow", "green"] as const;
const PEOPLE_WORDS = ["", "Один ребёнок", "Два ребёнка", "Три ребёнка"];
const CAR_WORDS = ["", "одна машинка", "две машинки", "три машинки"];
const PROMPTS = [
  "",
  "У нас один ребёнок. Дай ему одну машинку.",
  "У нас два ребёнка. Дай им две машинки.",
  "У нас три ребёнка. Дай им три машинки.",
];
const PAIR_WORDS = ["", "Один ребёнок - одна машинка!", "Два ребёнка - две машинки!", "Три ребёнка - три машинки!"];

function Person({ index }: { index: number }) {
  return <span className="car-people-person" data-person={index} aria-hidden="true" />;
}

function Cars({ count }: { count: Count }) {
  return <span className="car-people-cars" aria-hidden="true">
    {CAR_COLORS.slice(0, count).map(color =>
      <img key={color} src={`/images/luke-cars/car-${color}.svg`} alt="" draggable={false} />)}
  </span>;
}

export default function CarPeopleGame({ soundEnabled, onSolved, onComplete }: {
  soundEnabled: boolean;
  onSolved: () => void;
  onComplete: () => void;
}) {
  const analytics = useGameAnalytics("car-people", CAR_PEOPLE_ANALYTICS);
  // Shuffled after hydration so the server and the first client render agree; until then nothing is on the board.
  const [order, setOrder] = useState<Count[] | null>(null);
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<"choose" | "success">("choose");
  const [feedback, setFeedback] = useState("Выбери одну машинку для ребёнка");
  const [hint, setHint] = useState(false);
  const [drag, setDrag] = useState<{ count: Count; x: number; y: number } | null>(null);
  const pointer = useRef<{ count: Count; x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const locked = useRef(false);
  const wrongAttempts = useRef(0);
  const transition = useRef<ReturnType<typeof setTimeout> | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const count: Count = order?.[round] ?? 1;

  useEffect(() => {
    preloadVoices([
      ...PROMPTS.slice(1), ...PAIR_WORDS.slice(1),
      ...CAR_PEOPLE_COUNTS.flatMap(people => CAR_PEOPLE_CHOICES[people]
        .filter(choice => choice !== people)
        .map(choice => `Здесь ${CAR_WORDS[choice]}. ${PROMPTS[people]}`)),
    ]);
    setOrder(createCarPeopleOrder());
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    title.current?.focus({ preventScroll: true });
    return () => {
      if (transition.current) clearTimeout(transition.current);
      document.body.style.overflow = previousOverflow;
      stopSpeaking();
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    if (!order || phase !== "choose") return;
    speakRussian(PROMPTS[count], soundEnabled);
  }, [order, round, soundEnabled, phase]);

  function answer(choice: Count, method: "tap" | "drag") {
    if (locked.current || phase !== "choose") return;
    const correct = choice === count;
    analytics.answer(correct, method, { round: count, step: round + 1, chosen_count: choice });
    if (!correct) {
      wrongAttempts.current += 1;
      setHint(wrongAttempts.current >= 2);
      setFeedback(`${CAR_WORDS[choice][0].toUpperCase()}${CAR_WORDS[choice].slice(1)}. Посмотри на детей ещё раз.`);
      speakRussian(`Здесь ${CAR_WORDS[choice]}. ${PROMPTS[count]}`, soundEnabled);
      return;
    }

    locked.current = true;
    setHint(false);
    setPhase("success");
    setFeedback(PAIR_WORDS[count]);
    speakRussian(PAIR_WORDS[count], soundEnabled);
    if (round === CAR_PEOPLE_ROUNDS - 1) {
      analytics.complete();
      // Resume during the child's gesture so strict mobile browsers accept playback.
      onSolved();
      transition.current = setTimeout(onComplete, voiceDelay(PAIR_WORDS[count], soundEnabled, 2100));
      return;
    }
    transition.current = setTimeout(() => {
      setRound(value => value + 1);
      setPhase("choose");
      setFeedback("Выбери машинки для детей");
      wrongAttempts.current = 0;
      locked.current = false;
    }, voiceDelay(PAIR_WORDS[count], soundEnabled, 1700));
  }

  return <div className="car-people-overlay" role="dialog" aria-modal="true" aria-labelledby="car-people-title"
    data-testid="car-people-game" data-round={order ? count : undefined} data-step={round + 1} data-phase={phase} ref={root}
    onContextMenu={event => event.preventDefault()} onDragStart={event => event.preventDefault()}
    onKeyDown={event => {
      if (event.key === "Escape") { event.stopPropagation(); onComplete(); }
      if (event.key !== "Tab") return;
      const buttons = Array.from(root.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === title.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
    <section className="car-people-stage">
      <header className="car-people-toolbar">
        <div className="car-people-progress" aria-label={`Раунд ${round + 1} из ${CAR_PEOPLE_ROUNDS}`}>
          {Array.from({ length: CAR_PEOPLE_ROUNDS }, (_, index) => index + 1).map(value => <span key={value} data-done={value <= round} data-current={value === round + 1} />)}
        </div>
        <button type="button" className="car-people-close" aria-label="Закрыть игру" onClick={onComplete}><X /></button>
      </header>

      <div className="car-people-heading">
        <h2 id="car-people-title" tabIndex={-1} ref={title}>{phase === "success" ? "Каждому хватило!" : "Дай детям машинки"}</h2>
        <button type="button" className="car-people-repeat" aria-label="Повторить задание голосом"
          disabled={!soundEnabled || phase === "success"} onClick={() => { analytics.repeatInstruction(); speakRussian(PROMPTS[count], soundEnabled); }}><Volume2 /></button>
      </div>
      <p className="car-people-instruction">{phase === "success" ? PAIR_WORDS[count] : PROMPTS[count]}</p>

      {order && <><button type="button" className="car-people-target" data-people-target="true" data-testid="people-group"
        aria-label={`${PEOPLE_WORDS[count]}. Нажми, чтобы услышать задание.`} onClick={() => speakRussian(PROMPTS[count], soundEnabled)}>
        <span className="car-people-person-row">
          {Array.from({ length: count }, (_, index) => <Person key={index} index={index} />)}
        </span>
        <span className="car-people-target-bottom">{phase === "success" ? <Cars count={count} /> : <span className="car-people-parking">Сюда нужны машинки</span>}</span>
      </button>

      <div className="car-people-options" aria-label="Группы машинок">
        {CAR_PEOPLE_CHOICES[count].map(option => <button type="button" key={option} className="car-people-option"
          data-testid={`cars-${option}`} data-count={option} data-hint={hint && option === count} disabled={phase === "success"}
          aria-label={`${CAR_WORDS[option]}. Выбрать эту группу.`}
          onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } answer(option, "tap"); }}
          onPointerDown={event => {
            if (!event.isPrimary || event.button !== 0 || locked.current) return;
            pointer.current = { count: option, x: event.clientX, y: event.clientY, moved: false };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={event => {
            const current = pointer.current;
            if (!current || current.count !== option) return;
            if (Math.hypot(event.clientX - current.x, event.clientY - current.y) > 8) current.moved = true;
            if (current.moved) setDrag({ count: option, x: event.clientX, y: event.clientY });
          }}
          onPointerUp={event => {
            const current = pointer.current;
            if (current?.moved) {
              const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-people-target]");
              if (target) answer(current.count, "drag");
              suppressClick.current = true;
              setTimeout(() => { suppressClick.current = false; }, 0);
            }
            pointer.current = null;
            setDrag(null);
          }}
          onPointerCancel={() => { pointer.current = null; setDrag(null); }}
          onLostPointerCapture={() => { pointer.current = null; setDrag(null); }}>
          <Cars count={option} />
        </button>)}
      </div>
      </>}
      <p className="car-people-feedback" role="status">{feedback}</p>
      <p className="car-people-tip">Можно нажать на машинки или перетащить их к друзьям</p>
    </section>
    {drag && <div className="car-people-drag" style={{ left: drag.x, top: drag.y }}><Cars count={drag.count} /></div>}
  </div>;
}
