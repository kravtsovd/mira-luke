"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, Volume2, X } from "lucide-react";
import { voiceDelay } from "../lib/voice-timing";
import { CAR_PUZZLE_ANALYTICS, CAR_PUZZLE_GAME, CAR_PUZZLE_ROUNDS, PUZZLE_HALVES, PUZZLE_VEHICLES, createCarPuzzleRounds, type CarPuzzleRound, type PuzzleHalf } from "../lib/car-puzzle";
import { preloadVoices, speakRussian, stopSpeaking } from "../lib/speech";
import useGameAnalytics from "./useGameAnalytics";
import "./toddler-cars.css";
import "./car-puzzle.css";

const PRAISE = "Молодец!";
const RETRY = "Попробуй ещё раз";
const halfName = (half: PuzzleHalf) => half === "left" ? "Левая половинка" : "Правая половинка";

// Both the tray and the board crop the same original, so the halves meet without a seam.
function HalfPicture({ src, half }: { src: string; half: PuzzleHalf }) {
  return <span className="puzzle-half-picture" data-half={half}>
    <img src={src} alt="" aria-hidden="true" draggable={false} />
  </span>;
}

export default function CarPuzzleGame({ soundEnabled, onSolved, onComplete }: {
  soundEnabled: boolean; onSolved: () => void; onComplete: () => void;
}) {
  const analytics = useGameAnalytics(CAR_PUZZLE_GAME, CAR_PUZZLE_ANALYTICS);
  const [rounds, setRounds] = useState<CarPuzzleRound[]>([]);
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<"drag" | "success">("drag");
  const [placed, setPlaced] = useState<PuzzleHalf[]>([]);
  const placedNow = useRef(new Set<PuzzleHalf>());
  const [selected, setSelected] = useState<PuzzleHalf | null>(null);
  const [hint, setHint] = useState(false);
  const [missed, setMissed] = useState(false);
  const [drag, setDrag] = useState<{ x: number; y: number; half: PuzzleHalf } | null>(null);
  const pointer = useRef<{ id: number; x: number; y: number; half: PuzzleHalf; moved: boolean } | null>(null);
  const locked = useRef(false);
  const transition = useRef<ReturnType<typeof setTimeout> | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const finish = useRef(onComplete);
  finish.current = onComplete;
  const puzzle = rounds[round];
  const last = round === CAR_PUZZLE_ROUNDS - 1;
  const prompt = puzzle?.prompt ?? "";

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setRounds(createCarPuzzleRounds());
    preloadVoices([...PUZZLE_VEHICLES.map(vehicle => vehicle.prompt), PRAISE, RETRY]);
    title.current?.focus({ preventScroll: true });
    return () => {
      if (transition.current) clearTimeout(transition.current);
      document.body.style.overflow = overflow;
      stopSpeaking();
      previous?.focus();
    };
  }, []);

  useEffect(() => {
    if (!prompt) return;
    speakRussian(phase === "success" ? PRAISE : prompt, soundEnabled);
    return stopSpeaking;
  }, [prompt, phase, soundEnabled]);

  useEffect(() => {
    if (!puzzle || phase !== "drag") return;
    const timer = setTimeout(() => setHint(true), 9000);
    return () => clearTimeout(timer);
  }, [puzzle, phase]);

  function place(half: PuzzleHalf, slot: string, method: "drag" | "tap" | "key") {
    if (!puzzle || phase !== "drag" || locked.current || placedNow.current.has(half)) return;
    if (slot !== half) {
      analytics.answer(false, method, { vehicle: puzzle.id, half });
      setMissed(true);
      setHint(true);
      speakRussian(RETRY, soundEnabled);
      return;
    }
    placedNow.current.add(half);
    setPlaced([...placedNow.current]);
    setSelected(null);
    setHint(false);
    setMissed(false);
    if (placedNow.current.size !== PUZZLE_HALVES.length) return;
    analytics.answer(true, method, { vehicle: puzzle.id });
    locked.current = true;
    setPhase("success");
    stopSpeaking();
    if (last) {
      analytics.complete();
      // Resume in the final answer gesture to preserve iOS autoplay permission.
      onSolved();
      transition.current = setTimeout(() => finish.current(), voiceDelay(PRAISE, soundEnabled, 1200));
    } else {
      transition.current = setTimeout(() => {
        placedNow.current = new Set();
        setPlaced([]);
        setSelected(null);
        setRound(value => value + 1);
        setPhase("drag");
        locked.current = false;
      }, voiceDelay(PRAISE, soundEnabled, 1600));
    }
  }

  return <div ref={root} className="toddler-overlay" data-testid="car-puzzle-game" data-round={round} data-phase={phase}
    data-vehicle={puzzle?.id ?? ""} data-placed-count={placed.length}
    role="dialog" aria-modal="true" aria-labelledby="toddler-title" onContextMenu={event => event.preventDefault()} onDragStart={event => event.preventDefault()}
    onKeyDown={event => {
      if (event.key === "Escape") { event.stopPropagation(); onComplete(); }
      if (event.key !== "Tab") return;
      const buttons = Array.from(root.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
      const first = buttons[0], lastButton = buttons[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === title.current)) { event.preventDefault(); lastButton?.focus(); }
      else if (!event.shiftKey && document.activeElement === lastButton) { event.preventDefault(); first?.focus(); }
    }}>
    <section className="toddler-game toddler-puzzle">
      <header className="toddler-toolbar">
        <div className="toddler-progress" aria-label={`Готово ${round + (phase === "success" ? 1 : 0)} из ${CAR_PUZZLE_ROUNDS}`}>
          {Array.from({ length: CAR_PUZZLE_ROUNDS }, (_, index) => <span key={index} data-filled={index < round || (index === round && phase === "success")} aria-hidden="true"><Check /></span>)}
        </div>
        <button className="toddler-close" type="button" aria-label="Закрыть игру" onClick={onComplete}><X /></button>
      </header>
      <div className="toddler-heading">
        <h2 id="toddler-title" ref={title} tabIndex={-1}>{phase === "success" ? last ? "Молодец, Люк!" : "Получилось!" : prompt || "Машинка ждёт"}</h2>
        <button type="button" className="toddler-repeat" aria-label="Повторить задание голосом" disabled={phase === "success" || !soundEnabled}
          onClick={() => { if (locked.current) return; analytics.repeatInstruction("voice"); speakRussian(prompt, soundEnabled); }}><Volume2 /></button>
      </div>
      {puzzle && <div className="puzzle-workspace">
        <div className="puzzle-board" data-testid="puzzle-car" data-complete={phase === "success"}>
          {PUZZLE_HALVES.map(half => <button key={half} type="button" className="puzzle-slot" data-puzzle-slot={half}
            data-testid={`puzzle-slot-${half}`} data-placed={placed.includes(half)} data-hint={hint && !placed.includes(half)}
            disabled={phase !== "drag" || placed.includes(half)} aria-label={`Место для: ${halfName(half)}`}
            onClick={() => { if (selected) place(selected, half, "tap"); }}>
            <HalfPicture src={puzzle.image} half={half} />
          </button>)}
        </div>
        <div className="puzzle-tray">
          {puzzle.pieces.map(half => <button key={`${round}-${half}`} type="button" className="puzzle-piece" data-testid={`puzzle-piece-${half}`}
            aria-label={`${halfName(half)}. Перетащи на картинку`} aria-pressed={selected === half}
            data-dragging={drag?.half === half} data-placed={placed.includes(half)} disabled={phase !== "drag" || placed.includes(half)} draggable={false}
            onPointerDown={event => {
              if (!event.isPrimary || event.button !== 0 || locked.current || placedNow.current.has(half)) return;
              pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, half, moved: false };
              event.currentTarget.setPointerCapture?.(event.pointerId);
              setSelected(half);
              setMissed(false);
            }}
            onPointerMove={event => {
              const current = pointer.current;
              if (!current || current.id !== event.pointerId) return;
              if (Math.hypot(event.clientX - current.x, event.clientY - current.y) > 8) current.moved = true;
              if (current.moved) setDrag({ x: event.clientX, y: event.clientY, half });
            }}
            onPointerUp={event => {
              const current = pointer.current;
              if (!current || current.id !== event.pointerId) return;
              pointer.current = null;
              setDrag(null);
              if (!current.moved) return;
              const slot = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-puzzle-slot]");
              place(half, slot?.dataset.puzzleSlot ?? "", "drag");
            }}
            onPointerCancel={() => { pointer.current = null; setDrag(null); setSelected(null); }}
            onLostPointerCapture={() => { pointer.current = null; setDrag(null); }}
            onClick={event => { if (event.detail === 0) place(half, half, "key"); }}>
            <HalfPicture src={puzzle.image} half={half} />
          </button>)}
        </div>
      </div>}
      <p className="toddler-feedback" role="status">{phase === "success" ? "★" : missed ? "Попробуй другое место" : selected ? "Теперь нажми на место половинки" : "Перетащи половинки на картинку"}</p>
    </section>
    {drag && puzzle && <div className="toddler-puzzle-ghost" style={{ left: drag.x, top: drag.y } as CSSProperties} aria-hidden="true"><HalfPicture src={puzzle.image} half={drag.half} /></div>}
  </div>;
}
