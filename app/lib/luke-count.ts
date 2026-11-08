import { LUKE_TASKS_PER_GAME, shuffleWith } from "./luke-tasks";

export const LUKE_COUNT_GAME = "luke-count";
export const LUKE_COUNT_PROMPT = "Перетащи Люков к машинкам";
export const LUKE_COUNT_WRONG = "Тут другое количество";
// Spoken lines. The voice pack is generated from voice-manifest.json with an ElevenLabs key nobody here holds,
// so the game says already recorded lines rather than dropping to the system voice.
export const LUKE_COUNT_WRONG_VOICE = "Попробуй ещё раз";
export const LUKE_COUNT_PRAISE = "Молодец!";

export const LUKE_COUNT_VARIANT = "count-two-pairs-v3";
export const LUKE_COUNT_LAUNCH_DATE = "2026-10-09";
export const LUKE_COUNT_ANALYTICS = { game_variant: LUKE_COUNT_VARIANT, launch_date: LUKE_COUNT_LAUNCH_DATE };

export const LUKE_COUNTS = [1, 2, 3] as const;
export type LukeCount = (typeof LUKE_COUNTS)[number];
// Session thr_qmx4fhydbe (a parent, 2026-10-09): two groups of boys and two groups of cars per game, the same two
// counts in both rows, a different pair each game. a parent asked for exactly two and two, not a third group of cars.
export const LUKE_GROUPS_PER_GAME = LUKE_TASKS_PER_GAME;

export interface LukeCountBoard {
  lukes: LukeCount[];
  cars: LukeCount[];
}

// Both rows shuffle independently, so the answer is not always the card straight below this one.
export function createLukeCountBoard(random: () => number = Math.random): LukeCountBoard {
  const counts = shuffleWith(LUKE_COUNTS, random).slice(0, LUKE_GROUPS_PER_GAME);
  return { lukes: counts, cars: shuffleWith(counts, random) };
}
