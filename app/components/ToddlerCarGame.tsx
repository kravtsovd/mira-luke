"use client";

import { voiceDelay } from "../lib/voice-timing";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Check, RotateCcw, Volume2, X } from "lucide-react";
import { createToddlerRounds, HIDE_FIND, HIDE_GARAGE_LABELS, HIDE_GARAGES, HIDE_WATCH, TODDLER_ROUNDS, ToddlerCarGame as GameKind } from "../lib/toddler-cars";
import { speakRussian, stopSpeaking } from "../lib/speech";
import useGameAnalytics from "./useGameAnalytics";
import ToddlerCarArt, { PartArt } from "./ToddlerCarArt";
import "./toddler-cars.css";

export default function ToddlerCarGame({ type, soundEnabled, onSolved, onComplete }: {
  type: GameKind; soundEnabled: boolean; onSolved: () => void; onComplete: () => void;
}) {
  const analytics = useGameAnalytics(type, type === "car-hide" ? { game_variant: "hide-three-garages-v2", launch_date: "2026-10-02" } : {});
  const [rounds, setRounds] = useState<ReturnType<typeof createToddlerRounds>>([]);
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<"watch" | "choose" | "success">(type === "car-hide" ? "watch" : "choose");
  const [hint, setHint] = useState(false);
  const [replay, setReplay] = useState(0);
  const locked = useRef(false);
  // Session thr_shrdda8h8y: Luke's finger slides while he taps, so iOS often never fires `click`. Every choice answers
  // on pointerdown instead; the click that may follow the same touch is swallowed so a wrong answer is not counted twice.
  const tapped = useRef(false);
  const transition = useRef<ReturnType<typeof setTimeout> | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const finish = useRef(onComplete);
  finish.current = onComplete;
  const board = rounds[round];
  const hiddenGame = type === "car-hide";
  const workshop = type === "car-workshop";
  const done = phase === "success" && round === TODDLER_ROUNDS - 1;
  const prompt = !board ? "" : hiddenGame ? (phase === "watch" ? HIDE_WATCH : HIDE_FIND) : workshop ? board.part.prompt : board.vehicle.prompt;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setRounds(createToddlerRounds());
    title.current?.focus({ preventScroll: true });
    return () => {
      if (transition.current) clearTimeout(transition.current);
      document.body.style.overflow = overflow;
      stopSpeaking();
      previous?.focus();
    };
  }, []);

  useEffect(() => {
    if (!prompt || done) return;
    speakRussian(phase === "success" ? "Молодец!" : prompt, soundEnabled);
    return stopSpeaking;
  }, [prompt, phase, soundEnabled, replay, done]);

  useEffect(() => {
    if (!board || phase !== "watch") return;
    const timer = setTimeout(() => setPhase("choose"), 3600);
    return () => clearTimeout(timer);
  }, [board, phase, replay]);

  useEffect(() => {
    if (!board || phase !== "choose") return;
    const timer = setTimeout(() => setHint(true), 9000);
    return () => clearTimeout(timer);
  }, [board, phase, replay]);

  function repeat() {
    if (locked.current) return;
    // The hiding game replays the car driving into a garage; the others only say the prompt again.
    analytics.repeatInstruction(hiddenGame ? "visual" : "voice");
    setHint(false);
    if (hiddenGame) setPhase("watch");
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
      speakRussian(prompt, soundEnabled);
      return;
    }
    locked.current = true;
    setHint(false);
    setPhase("success");
    stopSpeaking();
    if (round === TODDLER_ROUNDS - 1) {
      analytics.complete();

      onSolved();
      transition.current = setTimeout(() => finish.current(), voiceDelay("Молодец!", soundEnabled, 900));
    } else {
      transition.current = setTimeout(() => {
        setRound(value => value + 1);
        setPhase(hiddenGame ? "watch" : "choose");
        locked.current = false;
      }, voiceDelay("Молодец!", soundEnabled, 1400));
    }
  }

  return <div ref={root} className="toddler-overlay" data-testid="toddler-game" data-game={type} data-round={round} data-phase={phase}
    role="dialog" aria-modal="true" aria-labelledby="toddler-title" onContextMenu={event => event.preventDefault()} onDragStart={event => event.preventDefault()}
    onKeyDown={event => {
      if (event.key === "Escape") { event.stopPropagation(); onComplete(); }
      if (event.key !== "Tab") return;
      const buttons = Array.from(root.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === title.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
    <section className={`toddler-game ${workshop ? "toddler-workshop" : ""}`}>
      <header className="toddler-toolbar">
        <div className="toddler-progress" aria-label={`Готово ${round + (phase === "success" ? 1 : 0)} из ${TODDLER_ROUNDS}`}>
          {Array.from({ length: TODDLER_ROUNDS }, (_, index) => index).map(index => <span key={index} data-filled={index < round || (index === round && phase === "success")} aria-hidden="true"><Check /></span>)}
        </div>
        <button className="toddler-close" type="button" aria-label="Закрыть игру" onClick={onComplete}><X /></button>
      </header>
      <div className="toddler-heading">
        <h2 id="toddler-title" ref={title} tabIndex={-1}>{phase === "success" ? done ? "Молодец, Люк!" : "Получилось!" : prompt || "Машинки ждут"}</h2>
        <button type="button" className="toddler-repeat" aria-label={hiddenGame ? "Показать ещё раз" : "Повторить задание голосом"}
          disabled={phase === "success" || (!hiddenGame && !soundEnabled)} onClick={repeat}>{hiddenGame ? <RotateCcw /> : <Volume2 />}</button>
      </div>

      {board && <>
        {workshop && <div className="toddler-repair-scene" data-repaired={phase === "success"}>
          <ToddlerCarArt missing={board.part.id} repaired={phase === "success"} />
          <div className="toddler-workbench" />
        </div>}
        <div className={`toddler-choices ${hiddenGame ? "toddler-garages" : ""}`}>
          {hiddenGame ? Array.from({ length: HIDE_GARAGES }, (_, index) => index).map(index => {
            const correct = index === board.garage;
            const visible = correct && phase !== "choose";
            return <button type="button" className="toddler-garage" key={`${round}-${replay}-${index}`} data-testid={`toddler-garage-${index}`}
              aria-label={HIDE_GARAGE_LABELS[index]} disabled={phase !== "choose"} data-hint={hint && correct}
              data-open={phase !== "choose"} {...choose(correct)}>
              <span className="toddler-roof" /><span className="toddler-garage-body">
                <span className="toddler-garage-inside">
                  {visible && <span className="toddler-hidden-car" data-testid="hiding-car" data-entering={phase === "watch"}><ToddlerCarArt kind="bus" /></span>}
                  <span className="toddler-garage-shutter" />
                </span>
              </span>
            </button>;
          }) : workshop ? board.parts.map(part => <button key={part.id} type="button" className="toddler-choice toddler-part" data-testid={`toddler-choice-${part.id}`}
            aria-label={part.name} data-hint={hint && part.id === board.part.id} data-success={phase === "success" && part.id === board.part.id}
            disabled={phase !== "choose"} {...choose(part.id === board.part.id)}><PartArt part={part.id} /><span>{part.name}</span></button>) :
            board.vehicles.map(vehicle => <button key={vehicle.id} type="button" className="toddler-choice" data-testid={`toddler-choice-${vehicle.id}`}
              aria-label={vehicle.name} data-hint={hint && vehicle.id === board.vehicle.id} data-success={phase === "success" && vehicle.id === board.vehicle.id}
              disabled={phase !== "choose"} {...choose(vehicle.id === board.vehicle.id)}><ToddlerCarArt kind={vehicle.id} /><span>{vehicle.name}</span></button>)}
        </div>
      </>}
      <p className="toddler-feedback" role="status">{phase === "success" ? "★" : phase === "watch" ? "Смотри на машинку" : hint ? "Вот здесь. Попробуй нажать" : "Нажми на картинку"}</p>
    </section>
  </div>;
}
