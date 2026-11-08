"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Volume2, X } from "lucide-react";
import {
  createLukeCountBoard, LukeCount, LUKE_COUNT_ANALYTICS, LUKE_COUNT_PRAISE, LUKE_GROUPS_PER_GAME,
  LUKE_COUNT_PROMPT, LUKE_COUNT_WRONG, LUKE_COUNT_WRONG_VOICE,
} from "../lib/luke-count";
import { speakRussian, stopSpeaking } from "../lib/speech";
import useGameAnalytics from "./useGameAnalytics";
import LukeBoyArt from "./LukeBoyArt";
import LukeCarArt from "./LukeCarArt";
import "./luke-count.css";

export default function LukeCountGame({ soundEnabled, onSolved, onComplete }: {
  soundEnabled: boolean; onSolved: () => void; onComplete: () => void;
}) {
  const analytics = useGameAnalytics("luke-count", LUKE_COUNT_ANALYTICS);
  const [board, setBoard] = useState<ReturnType<typeof createLukeCountBoard> | null>(null);
  const [matched, setMatched] = useState<LukeCount[]>([]);
  const [drag, setDrag] = useState<{ count: LukeCount; x: number; y: number } | null>(null);
  const [held, setHeld] = useState<LukeCount | null>(null);
  const [wrong, setWrong] = useState<LukeCount | null>(null);
  const pointer = useRef<{ count: LukeCount; x: number; y: number; moved: boolean } | null>(null);
  const locked = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const finish = useRef(onComplete);
  finish.current = onComplete;
  const done = matched.length === LUKE_GROUPS_PER_GAME;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Shuffle after hydration so the server and the first client render agree on the board.
    setBoard(createLukeCountBoard());
    title.current?.focus({ preventScroll: true });
    return () => {
      if (timer.current) clearTimeout(timer.current);
      document.body.style.overflow = overflow;
      stopSpeaking();
      previous?.focus();
    };
  }, []);

  useEffect(() => {
    if (!board || done) return;
    speakRussian(LUKE_COUNT_PROMPT, soundEnabled);
    return stopSpeaking;
  }, [board, done, soundEnabled]);

  function carTargetAt(x: number, y: number): LukeCount | undefined {
    const direct = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-cars]");
    if (direct?.dataset.cars) return Number(direct.dataset.cars) as LukeCount;

    // A near miss at the edge still lands. Choose by distance, never by the answer,
    // so the neighbouring group remains a real choice and completed cards stay occupied.
    let nearest: LukeCount | undefined;
    let distance = 28;
    for (const card of root.current?.querySelectorAll<HTMLElement>("[data-cars]") ?? []) {
      const rect = card.getBoundingClientRect();
      const gap = Math.hypot(Math.max(rect.left - x, 0, x - rect.right), Math.max(rect.top - y, 0, y - rect.bottom));
      if (gap < distance) {
        distance = gap;
        nearest = Number(card.dataset.cars) as LukeCount;
      }
    }
    return nearest;
  }

  function drop(lukes: LukeCount, cars: LukeCount | undefined, method: "drag" | "key") {
    if (locked.current || cars === undefined || matched.includes(lukes) || matched.includes(cars)) return;

    if (lukes !== cars) {
      analytics.answer(false, method);
      setWrong(cars);
      speakRussian(LUKE_COUNT_WRONG_VOICE, soundEnabled);
      return;
    }

    analytics.answer(true, method);
    setWrong(null);
    const next = [...matched, lukes];
    setMatched(next);
    speakRussian(LUKE_COUNT_PRAISE, soundEnabled);
    if (next.length < LUKE_GROUPS_PER_GAME) return;

    locked.current = true;
    title.current?.focus({ preventScroll: true });
    analytics.complete();
    // Resume inside the dropping gesture, before a timer loses mobile autoplay permission.
    onSolved();
    timer.current = setTimeout(() => finish.current(), 1800);
  }

  const boys = (count: LukeCount) =>
    Array.from({ length: count }, (_, index) => <span key={index} className="luke-count-item"><LukeBoyArt /></span>);

  // Once a group has been joined, its boys ride in the cars they were dragged to: one boy per car. That picture is
  // the answer standing on screen, so Luke can see what he just did instead of reading a tick.
  const cars = (count: LukeCount, riding: boolean) =>
    Array.from({ length: count }, (_, index) => (
      <span key={index} className="luke-count-item">
        <span className="luke-count-seat" data-riding={riding}>
          {riding && <span className="luke-count-rider"><LukeBoyArt /></span>}
          <LukeCarArt />
        </span>
      </span>
    ));

  return <div ref={root} className="luke-count-overlay" role="dialog" aria-modal="true" aria-labelledby="luke-count-title"
    data-testid="luke-count-game" onContextMenu={event => event.preventDefault()} onDragStart={event => event.preventDefault()}
    onKeyDown={event => {
      if (event.key === "Escape") { event.stopPropagation(); onComplete(); }
      if (event.key !== "Tab") return;
      const buttons = Array.from(root.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === title.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
    <section className="luke-count-game">
      <header className="luke-count-toolbar">
        <div className="luke-count-progress" aria-label={`Соединено ${matched.length} из ${LUKE_GROUPS_PER_GAME}`}>
          {Array.from({ length: LUKE_GROUPS_PER_GAME }, (_, index) => <span key={index} data-filled={index < matched.length} aria-hidden="true"><Check /></span>)}
        </div>
        <button type="button" className="luke-count-close" aria-label="Закрыть игру" onClick={onComplete}><X /></button>
      </header>

      <div className="luke-count-heading">
        <h2 id="luke-count-title" ref={title} tabIndex={-1}>{done ? "Молодец, Люк!" : "Перетащи Люков к машинкам"}</h2>
        <button type="button" className="luke-count-repeat" aria-label="Повторить задание голосом" disabled={!soundEnabled || done}
          onClick={() => { analytics.repeatInstruction(); speakRussian(LUKE_COUNT_PROMPT, soundEnabled); }}><Volume2 /></button>
      </div>

      {board && <div className="luke-count-rows">
        <div className="luke-count-row" data-row="lukes" data-cards={board.lukes.length}>
          {board.lukes.map(count => (
            <button key={count} type="button" className="luke-count-card" data-testid={`lukes-${count}`} data-count={count}
              data-matched={matched.includes(count)} data-dragging={drag?.count === count} disabled={matched.includes(count) || done}
              aria-label={`Люки, ${count}. Перетащи к машинкам`} draggable={false}

              onPointerDown={event => {
                if (!event.isPrimary || event.button !== 0 || locked.current) return;
                pointer.current = { count, x: event.clientX, y: event.clientY, moved: false };
                event.currentTarget.setPointerCapture?.(event.pointerId);
                setHeld(count);
                setWrong(null);
              }}
              onPointerMove={event => {
                const current = pointer.current;
                if (!current || current.count !== count) return;
                if (Math.hypot(event.clientX - current.x, event.clientY - current.y) > 8) current.moved = true;
                if (current.moved) setDrag({ count, x: event.clientX, y: event.clientY });
              }}
              onPointerUp={event => {
                const current = pointer.current;
                pointer.current = null;
                setDrag(null);
                setHeld(null);
                if (!current || !current.moved) return;
                drop(current.count, carTargetAt(event.clientX, event.clientY), "drag");
              }}
              onPointerCancel={() => { pointer.current = null; setDrag(null); setHeld(null); }}
              onLostPointerCapture={() => { pointer.current = null; setDrag(null); setHeld(null); }}
              // Keyboard players pick up a group and drop it on the next Enter. Nothing on screen offers tapping,
              // so a stray finger tap does nothing at all.
              onKeyDown={event => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                setHeld(current => (current === count ? null : count));
              }}>
              <span className="luke-count-group" data-count={count}>{boys(count)}</span>
              {matched.includes(count) && <Check className="luke-count-tick" aria-hidden="true" />}
            </button>
          ))}
        </div>

        <div className="luke-count-row" data-row="cars" data-cards={board.cars.length}>
          {board.cars.map(count => (
            <button key={count} type="button" className="luke-count-card luke-count-card-cars" data-testid={`cars-${count}`}
              data-cars={count} data-count={count} data-wrong={wrong === count} data-matched={matched.includes(count)}
              disabled={matched.includes(count) || done} draggable={false}
              aria-label={matched.includes(count) ? `Люки в машинках, ${count}` : `Машинки, ${count}`}
              onKeyDown={event => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                if (held === null) return;
                const lukes = held;
                setHeld(null);
                drop(lukes, count, "key");
              }}>
              <span className="luke-count-group" data-count={count}>{cars(count, matched.includes(count))}</span>
            </button>
          ))}
        </div>
      </div>}

      <p className="luke-count-feedback" role="status">
        {done ? "" : wrong !== null ? LUKE_COUNT_WRONG : held !== null ? "Тащи к машинкам" : "Возьми Люков пальцем"}
      </p>
    </section>

    {drag && <div className="luke-count-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
      <span className="luke-count-group" data-count={drag.count}>{boys(drag.count)}</span>
    </div>}
  </div>;
}
