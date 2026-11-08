import { LUKE_TASKS_PER_GAME, shuffleWith } from "./luke-tasks";

export const GARAGE_COLORS = [
  { id: "red", paint: "#ef5350", car: "Красная машинка", garage: "Красный гараж" },
  { id: "yellow", paint: "#f7c948", car: "Жёлтая машинка", garage: "Жёлтый гараж" },
  { id: "green", paint: "#25ae7a", car: "Зелёная машинка", garage: "Зелёный гараж" },
] as const;
export type GarageColor = (typeof GARAGE_COLORS)[number];
export type GarageColorId = GarageColor["id"];
// Session thr_qmx4fhydbe (a parent, 2026-10-08): two cars to park per game, a different pair each time. All three
// garages stay on the street, so the second car still has to find its colour instead of taking the last free door.
export const GARAGE_CARS_PER_GAME = LUKE_TASKS_PER_GAME;

export interface GarageBoard {
  /** The cars waiting on the road, in the order they stand. */
  cars: GarageColor[];
  /** Every garage, rotated so the matching garage is never straight above its car. */
  garages: GarageColor[];
}

export function createGarageBoard(random: () => number = Math.random): GarageBoard {
  const offset = 1 + Math.floor(random() * (GARAGE_COLORS.length - 1));
  return {
    cars: shuffleWith(GARAGE_COLORS, random).slice(0, GARAGE_CARS_PER_GAME),
    garages: [...GARAGE_COLORS.slice(offset), ...GARAGE_COLORS.slice(0, offset)],
  };
}
