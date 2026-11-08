"use client";

import { voiceDelay } from "../lib/voice-timing";

import { CSSProperties, useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { speakRussian, stopSpeaking } from "../lib/speech";
import { createGarageBoard, GarageColorId as ColorId } from "../lib/car-garage";
import useGameAnalytics from "./useGameAnalytics";

const PROMPT = "Поставь машинки в гаражи такого же цвета";

function Car({ color }: { color: ColorId }) {
  return <img src={`/images/luke-cars/car-${color}.svg`} width={720} height={480}
    className="toy-car" alt="" aria-hidden="true" draggable={false} />;
}

export default function CarGarageGame({ soundEnabled, onSolved, onComplete }: { soundEnabled: boolean; onSolved: () => void; onComplete: () => void }) {
  const analytics = useGameAnalytics("cars");
  const [parked, setParked] = useState<ColorId[]>([]);
  const [selected, setSelected] = useState<ColorId | null>(null);
  const [feedback, setFeedback] = useState("Перетащи машинку к гаражу такого же цвета");
  const [drag, setDrag] = useState<{ color: ColorId; x: number; y: number } | null>(null);
  const pointer = useRef<{ color: ColorId; x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const completionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  // Picked once per game; the overlay only ever mounts on the client, after the cartoon has started.
  const [{ cars, garages }] = useState(createGarageBoard);
  const done = parked.length === cars.length;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    title.current?.focus();
    speakRussian(PROMPT, soundEnabled);
    return () => {
      document.body.style.overflow = previousOverflow;
      if (completionTimer.current !== null) clearTimeout(completionTimer.current);
      stopSpeaking();
    };
  }, [soundEnabled]);

  function park(car: ColorId | null, garage: string | undefined, method = "tap") {
    if (!car || !garage || parked.includes(car) || completionTimer.current !== null) return;
    analytics.answer(car === garage, method);
    if (car !== garage) {
      setFeedback("Попробуй ещё раз. Найди такой же цвет!");
      speakRussian("Попробуй ещё раз", soundEnabled);
      return;
    }
    const next = [...parked, car];
    setParked(next);
    setSelected(null);
    setFeedback(next.length === cars.length ? "Ура! Все машинки дома!" : "Получилось! Найди дом для следующей машинки");
    speakRussian("Молодец!", soundEnabled);
    if (next.length === cars.length) {
      analytics.complete();

      onSolved();
      completionTimer.current = setTimeout(onComplete, voiceDelay("Молодец!", soundEnabled, 900));
    }
  }

  return <div className="garage-overlay" role="dialog" aria-modal="true" aria-labelledby="garage-title" data-testid="car-game" onContextMenu={event => event.preventDefault()} onDragStart={event => event.preventDefault()}>
    <section className="garage-game">
      <header className="garage-heading">
        <div><p>Luke · Игра с цветами</p><h2 id="garage-title" ref={title} tabIndex={-1}>{done ? "Все машинки дома!" : "Машинки, по домам!"}</h2></div>
        <button className="garage-repeat" type="button" onClick={() => { analytics.repeatInstruction(); speakRussian(PROMPT, soundEnabled); }} disabled={!soundEnabled} aria-label="Повторить задание голосом"><Volume2 /><span>Послушать</span></button>
      </header>
      <div className="garage-progress" aria-label={`В гараже ${parked.length} из ${cars.length} машинок`}>
        {cars.map(color => <span key={color.id} data-filled={parked.includes(color.id)}>{parked.includes(color.id) ? "★" : "☆"}</span>)}
      </div>
      <div className="garage-neighborhood">
        {garages.map(color => <button key={color.id} type="button" className="toy-garage" style={{ "--paint": color.paint } as CSSProperties} data-garage={color.id} data-testid={`garage-${color.id}`} data-parked={parked.includes(color.id)} aria-label={color.garage} disabled={parked.includes(color.id)} onClick={() => park(selected, color.id)}>
          <span className="garage-roof" /><span className="garage-building"><span className="garage-sign" aria-hidden="true">{parked.includes(color.id) ? "★" : "⌂"}</span><span className="garage-door">{parked.includes(color.id) && <Car color={color.id} />}</span></span>
          <span className="garage-label">{color.garage}</span>
        </button>)}
      </div>
      <div className="garage-road" aria-hidden="true"><span /><span /><span /><span /><span /><span /></div>
      <div className="garage-cars" aria-label="Машинки" data-cars={cars.length}>
        {cars.map(color => <div className="car-space" key={color.id}>
          {!parked.includes(color.id) && <button type="button" className="car-pick" data-testid={`car-${color.id}`} data-dragging={drag?.color === color.id} aria-label={color.car} aria-pressed={selected === color.id}
            onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } setSelected(color.id); setFeedback("Теперь нажми на гараж такого же цвета"); }}
            onPointerDown={event => {
              if (!event.isPrimary || event.button !== 0) return;
              suppressClick.current = false;
              pointer.current = { color: color.id, x: event.clientX, y: event.clientY, moved: false };
              event.currentTarget.setPointerCapture(event.pointerId);
              setSelected(color.id);
            }}
            onPointerMove={event => {
              const current = pointer.current;
              if (!current || current.color !== color.id) return;
              if (Math.hypot(event.clientX - current.x, event.clientY - current.y) > 8) current.moved = true;
              if (current.moved) setDrag({ color: color.id, x: event.clientX, y: event.clientY });
            }}
            onPointerUp={event => {
              const current = pointer.current;
              if (!current) return;
              if (current.moved) {

                const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-garage]");
                park(current.color, target?.dataset.garage, "drag");
                suppressClick.current = true;
              }
              pointer.current = null;
              setDrag(null);
            }}
            onPointerCancel={() => { pointer.current = null; setDrag(null); }}
            onLostPointerCapture={() => { pointer.current = null; setDrag(null); }}
          ><Car color={color.id} /><span>{color.car}</span></button>}
          {parked.includes(color.id) && <span className="car-parked-mark" aria-label={`${color.car} в гараже`}>✓</span>}
        </div>)}
      </div>
      <footer className="garage-footer">
        <p role="status">{feedback}</p>
        <small>{done ? "Молодец! Возвращаемся к мультику…" : "Можно и нажать: сначала машинка, потом гараж"}</small>
      </footer>
    </section>
    {drag && <div className="car-drag-ghost" style={{ left: drag.x, top: drag.y }}><Car color={drag.color} /></div>}
  </div>;
}
