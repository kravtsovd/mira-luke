"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Gamepad2 } from "lucide-react";
import { GameType } from "../lib/settings";
import { GAME_LABELS } from "../lib/game-labels";

export default function GameLauncher({ name, games, onStart }: { name: string; games: readonly GameType[]; onStart: (game: GameType) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const firstGame = useRef<HTMLButtonElement>(null);
  const pickerId = useId();

  useEffect(() => {
    if (!open) return;
    firstGame.current?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  return <div className="game-launcher" ref={root}
    onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}
    onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); trigger.current?.focus(); } }}>
    <button type="button" ref={trigger} className="quick-games-button" aria-label={`Игры ${name}`} title={games.length === 1 ? `Играть: ${GAME_LABELS[games[0]].title}` : `Игры ${name}`} data-testid="quick-games"
      aria-expanded={games.length > 1 ? open : undefined} aria-haspopup={games.length > 1 ? "dialog" : undefined} aria-controls={open ? pickerId : undefined}
      onClick={() => { if (games.length === 1) onStart(games[0]); else setOpen(current => !current); }}>
      <Gamepad2 aria-hidden="true" />
    </button>
    {open && <div id={pickerId} className="quick-games-picker" role="dialog" aria-label={`Игры ${name}`}>
      <strong>Игры {name}</strong>
      {games.map((game, index) => <button type="button" key={game} ref={index === 0 ? firstGame : undefined} data-testid={`quick-game-${game}`}
        onClick={() => { setOpen(false); trigger.current?.focus(); onStart(game); }}>{GAME_LABELS[game].title}</button>)}
    </div>}
  </div>;
}
