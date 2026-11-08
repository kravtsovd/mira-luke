import { LUKE_TASKS_PER_GAME, shuffleWith } from "./luke-tasks";

export type CarPeopleCount = 1 | 2 | 3;
export const CAR_PEOPLE_COUNTS: readonly CarPeopleCount[] = [1, 2, 3];

// Session thr_2bq6mpd7x7 (a parent, 2026-10-05): the rounds used to run one, two, three every time, so Luke could
// learn the sequence instead of looking at the children. Now the rounds come in a random order.
// Session thr_qmx4fhydbe (a parent, 2026-10-08): a game is two rounds, two different counts out of the three.
export const CAR_PEOPLE_ROUNDS = LUKE_TASKS_PER_GAME;
export const CAR_PEOPLE_VARIANT = "people-cars-two-rounds-v4";
export const CAR_PEOPLE_LAUNCH_DATE = "2026-10-08";
export const CAR_PEOPLE_ANALYTICS = { game_variant: CAR_PEOPLE_VARIANT, launch_date: CAR_PEOPLE_LAUNCH_DATE };

// The groups of cars offered for each number of children. The single child keeps two options, the rest get three,
// and the right answer is never in the same slot twice.
export const CAR_PEOPLE_CHOICES: Record<CarPeopleCount, CarPeopleCount[]> = { 1: [2, 1], 2: [3, 1, 2], 3: [2, 3, 1] };

export function createCarPeopleOrder(random: () => number = Math.random): CarPeopleCount[] {
  return shuffleWith(CAR_PEOPLE_COUNTS, random).slice(0, CAR_PEOPLE_ROUNDS);
}
