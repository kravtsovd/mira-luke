import { LUKE_TASKS_PER_GAME, shuffleWith } from "./luke-tasks";
import { VEHICLES } from "./toddler-cars";

export const CAR_PUZZLE_GAME = "car-puzzle";
export const CAR_PUZZLE_ROUNDS = LUKE_TASKS_PER_GAME;
export const CAR_PUZZLE_ANALYTICS = { game_variant: "car-puzzle-two-halves-v2", launch_date: "2026-10-31" };
export const PUZZLE_HALVES = ["left", "right"] as const;
export type PuzzleHalf = (typeof PUZZLE_HALVES)[number];
const prompts = { fire: "Собери пожарную машину", bus: "Собери автобус", truck: "Собери грузовик", digger: "Собери экскаватор" };
export const PUZZLE_VEHICLES = VEHICLES.map(vehicle => ({ ...vehicle, prompt: prompts[vehicle.id], image: `/images/luke-cars/${vehicle.id}.svg` }));
export type CarPuzzleRound = (typeof PUZZLE_VEHICLES)[number] & { pieces: PuzzleHalf[] };
export function createCarPuzzleRounds(random: () => number = Math.random): CarPuzzleRound[] {
  return shuffleWith(PUZZLE_VEHICLES, random).slice(0, CAR_PUZZLE_ROUNDS).map(vehicle => ({ ...vehicle, pieces: shuffleWith(PUZZLE_HALVES, random) }));
}
