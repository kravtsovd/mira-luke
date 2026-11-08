"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Check, Volume2, X } from "lucide-react";
import { voiceDelay } from "../lib/voice-timing";
import { LUKE_TASKS_PER_GAME } from "../lib/luke-tasks";
import {
  animalImage, createAnimalRounds, createSameRounds, createSizeRounds, LUKE_TAP_LAUNCH_DATE, LUKE_TAP_PROMPTS,
  SAME_PROMPT, type AnimalRound, type LukeTapGame as GameKind, type SameRound, type SizeRound,
} from "../lib/luke-tap-games";
import { preloadVoices, speakRussian, stopSpeaking } from "../lib/speech";
import useGameAnalytics from "./useGameAnalytics";

import "./toddler-cars.css";
import "./luke-tap-games.css";

// Session thr_84z7x9rkr7 (a parent, 2026-10-09): one shell for Luke's three new tap games. It is the toddler car
// screen (big prompt, two pictures, voice repeat, hint after a wrong tap, answer on pointerdown) with a different
// board in the middle: two animals, a big and a small car, or a sample car over two cars.
type Choice = { id: string; label: string; correct: boolean; picture: React.ReactNode };
type Board =
  | { kind: "animal-voices"; round: AnimalRound }
  | { kind: "big-small"; round: SizeRound }
  | { kind: "same-car"; round: SameRound };

function makeBoards(kind: GameKind): Board[] {
  if (kind === "animal-voices") return createAnimalRounds().map(round => ({ kind, round }));
  if (kind === "big-small") return createSizeRounds().map(round => ({ kind, round }));
  return createSameRounds().map(round => ({ kind, round }));
}

function promptOf(board: Board): string {
  if (board.kind === "animal-voices") return board.round.animal.prompt;
  if (board.kind === "big-small") return board.round.item[board.round.size.id];
  return SAME_PROMPT;
}

// Matching reinforces the pictured word only after an answer, keeping the initial task about visual matching.
function praiseOf(board: Board): string {
  if (board.kind === "same-car") return board.round.item.praise;
  return board.kind === "animal-voices" ? board.round.animal.sound : "Молодец!";
}

function Picture({ item }: { item: { image: string } }) {
  return <img src={item.image} className="toddler-car-picture toddler-object-picture" width={640} height={640} alt="" aria-hidden="true" draggable={false} />;
}

function sizeLabel(prompt: string) {
  const label = prompt.replace(/^Найди /, "");
  return label[0].toUpperCase() + label.slice(1);
}

function choicesOf(board: Board): Choice[] {
  if (board.kind === "animal-voices") return board.round.choices.map(animal => ({
    id: animal.id, label: animal.name, correct: animal.id === board.round.animal.id,
    picture: <img src={animalImage(animal.id)} className="toddler-car-picture toddler-animal-picture" width={640} height={640} alt="" aria-hidden="true" draggable={false} />,
  }));
  if (board.kind === "big-small") return board.round.choices.map(size => ({
    id: size.id, label: sizeLabel(board.round.item[size.id]), correct: size.id === board.round.size.id,
    picture: <span className="toddler-sized" data-size={size.id}><Picture item={board.round.item} /></span>,
  }));
  return board.round.choices.map(item => ({
    id: item.id, label: item.name, correct: item.id === board.round.item.id,
    picture: <Picture item={item} />,
  }));
}

export default function LukeTapGame({ type, soundEnabled, onSolved, onComplete }: {
  type: GameKind; soundEnabled: boolean; onSolved: () => void; onComplete: () => void;
}) {
  const analytics = useGameAnalytics(type, { game_variant: `${type}-two-pictures-v2`, launch_date: LUKE_TAP_LAUNCH_DATE });
  const [boards, setBoards] = useState<Board[]>([]);
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<"choose" | "success">("choose");
  const [hint, setHint] = useState(false);
  const [replay, setReplay] = useState(0);
  const locked = useRef(false);
  // Session thr_shrdda8h8y: Luke's finger slides while he taps, so iOS often never fires `click`. Every choice answers
  // on pointerdown; the click that may follow the same touch is swallowed so a wrong answer is not counted twice.
  const tapped = useRef(false);
  const transition = useRef<ReturnType<typeof setTimeout> | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const finish = useRef(onComplete);
  finish.current = onComplete;
  const board = boards[round];
  const last = round === LUKE_TASKS_PER_GAME - 1;
  const done = phase === "success" && last;
  const prompt = board ? promptOf(board) : "";
  const praise = board ? praiseOf(board) : "Молодец!";
  const instruction = hint && board?.kind === "same-car" ? board.round.item.hint : prompt;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setBoards(makeBoards(type));
    preloadVoices([...LUKE_TAP_PROMPTS, "Молодец!"]);
    title.current?.focus({ preventScroll: true });
    return () => {
      if (transition.current) clearTimeout(transition.current);
      document.body.style.overflow = overflow;
      stopSpeaking();
      previous?.focus();
    };
  }, [type]);

  useEffect(() => {
    if (!instruction) return;
    speakRussian(phase === "success" ? praise : instruction, soundEnabled);
    return stopSpeaking;
  }, [instruction, praise, phase, soundEnabled, replay]);

  useEffect(() => {
    if (!board || phase !== "choose") return;
    const timer = setTimeout(() => setHint(true), 9000);
    return () => clearTimeout(timer);
  }, [board, phase, replay]);

  function repeat() {
    if (locked.current) return;
    analytics.repeatInstruction("voice");
    setHint(false);
    setReplay(value => value + 1);
  }

  const choose = (correct: boolean) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      if (!event.isPrimary || event.button !== 0) return;
      tapped.current = true;
      answer(correct);
    },
    onClick: () => {
      if (tapped.current) { tapped.current = false; return; }
      answer(correct);
    },
  });

  function answer(correct: boolean) {
    if (!board || phase !== "choose" || locked.current) return;
    analytics.answer(correct);
    if (!correct) {
      setHint(true);
      // A repeated wrong tap should replay the specific hint even when it is already visible.
      setReplay(value => value + 1);
      return;
    }
    locked.current = true;
    setHint(false);
    setPhase("success");
    stopSpeaking();
    if (last) {
      analytics.complete();

      onSolved();
      transition.current = setTimeout(() => finish.current(), voiceDelay(praise, soundEnabled, 900));
    } else {
      transition.current = setTimeout(() => {
        setRound(value => value + 1);
        setPhase("choose");
        locked.current = false;
      }, voiceDelay(praise, soundEnabled, 1400));
    }
  }

  const heading = phase === "success" ? (board?.kind === "same-car" ? praise : done ? "Молодец, Люк!" : board?.kind === "animal-voices" ? praise : "Получилось!") : instruction || "Картинки ждут";

  return <div ref={root} className="toddler-overlay" data-testid="toddler-game" data-game={type} data-round={round} data-phase={phase}
    role="dialog" aria-modal="true" aria-labelledby="toddler-title" onContextMenu={event => event.preventDefault()} onDragStart={event => event.preventDefault()}
    onKeyDown={event => {
      if (event.key === "Escape") { event.stopPropagation(); onComplete(); }
      if (event.key !== "Tab") return;
      const buttons = Array.from(root.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
      const first = buttons[0], lastButton = buttons[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === title.current)) { event.preventDefault(); lastButton?.focus(); }
      else if (!event.shiftKey && document.activeElement === lastButton) { event.preventDefault(); first?.focus(); }
    }}>
    <section className={`toddler-game toddler-tap-${type}`}>
      <header className="toddler-toolbar">
        <div className="toddler-progress" aria-label={`Готово ${round + (phase === "success" ? 1 : 0)} из ${LUKE_TASKS_PER_GAME}`}>
          {Array.from({ length: LUKE_TASKS_PER_GAME }, (_, index) => <span key={index} data-filled={index < round || (index === round && phase === "success")} aria-hidden="true"><Check /></span>)}
        </div>
        <button className="toddler-close" type="button" aria-label="Закрыть игру" onClick={onComplete}><X /></button>
      </header>
      <div className="toddler-heading">
        <h2 id="toddler-title" ref={title} tabIndex={-1}>{heading}</h2>
        <button type="button" className="toddler-repeat" aria-label="Повторить задание голосом"
          disabled={phase === "success" || !soundEnabled} onClick={repeat}><Volume2 /></button>
      </div>

      {board && <>
        {board.kind === "same-car" && <div className="toddler-sample" data-testid="toddler-sample" data-item={board.round.item.id}>
          <Picture item={board.round.item} />
        </div>}
        <div className="toddler-choices">
          {choicesOf(board).map(choice => <button key={`${round}-${choice.id}`} type="button" className="toddler-choice" data-testid={`toddler-choice-${choice.id}`}
            aria-label={choice.label} data-hint={hint && choice.correct} data-success={phase === "success" && choice.correct}
            disabled={phase !== "choose"} {...choose(choice.correct)}>{choice.picture}<span>{choice.label}</span></button>)}
        </div>
      </>}
      <p className="toddler-feedback" role="status">{phase === "success" ? "★" : hint ? "Вот здесь. Попробуй нажать" : "Нажми на картинку"}</p>
    </section>
  </div>;
}
