import { LUKE_TASKS_PER_GAME, shuffleWith } from "./luke-tasks";
import { SIZE_PICTURES, MATCH_PICTURES, type LukePicture, type MatchPicture } from "./luke-pictures";

// Session thr_84z7x9rkr7 (a parent, 2026-10-09): three more tap games for Luke at 21 months. Each one is what children
// learn between 18 and 24 months: animal names and their sounds, big against small, and "the same one". Every game
// asks LUKE_TASKS_PER_GAME things, never more, and every screen offers exactly two pictures.
export const LUKE_TAP_GAMES = ["animal-voices", "big-small", "same-car"] as const;
export type LukeTapGame = (typeof LUKE_TAP_GAMES)[number];
export const isLukeTapGame = (value: string): value is LukeTapGame => LUKE_TAP_GAMES.includes(value as LukeTapGame);
export const LUKE_TAP_LAUNCH_DATE = "2026-10-09";

// The farm stickers are Mira's English art; Luke hears the Russian name and the sound the animal makes.
export const ANIMALS = [
  { id: "cow", name: "Корова", prompt: "Кто говорит му-у? Найди корову", sound: "Это корова. Му-у!" },
  { id: "dog", name: "Собака", prompt: "Кто говорит гав-гав? Найди собаку", sound: "Это собака. Гав-гав!" },
  { id: "cat", name: "Кошка", prompt: "Кто говорит мяу? Найди кошку", sound: "Это кошка. Мяу!" },
  { id: "duck", name: "Утка", prompt: "Кто говорит кря-кря? Найди утку", sound: "Это утка. Кря-кря!" },
] as const;
export type AnimalId = (typeof ANIMALS)[number]["id"];
export const animalImage = (id: AnimalId) => `/images/english-farm/${id}.svg`;

export const SIZES = [
  { id: "big", name: "Большая", prompt: "Найди большую машину" },
  { id: "small", name: "Маленькая", prompt: "Найди маленькую машину" },
] as const;
export type SizeId = (typeof SIZES)[number]["id"];

export const SAME_PROMPT = "Найди такую же картинку";

export interface AnimalRound { animal: (typeof ANIMALS)[number]; choices: (typeof ANIMALS)[number][] }
export interface SizeRound { item: LukePicture; size: (typeof SIZES)[number]; choices: (typeof SIZES)[number][] }
export interface SameRound { item: MatchPicture; choices: MatchPicture[] }

type Random = () => number;
const other = <T extends { id: string }>(pool: readonly T[], target: T, random: Random) =>
  shuffleWith(pool.filter(item => item.id !== target.id), random)[0];

// Two rounds, two different animals; the wrong picture is never the animal from the previous round, so a child who
// still remembers the last answer is not tempted by it.
export function createAnimalRounds(random: Random = Math.random): AnimalRound[] {
  const targets = shuffleWith(ANIMALS, random).slice(0, LUKE_TASKS_PER_GAME);
  return targets.map((animal, index) => {
    const pool = ANIMALS.filter(candidate => candidate.id !== targets[index - 1]?.id);
    return { animal, choices: shuffleWith([animal, other(pool, animal, random)], random) };
  });
}

// Both sizes come up once, on different objects. Only the image size differs between the two choices.
export function createSizeRounds(random: Random = Math.random): SizeRound[] {
  const pictures = shuffleWith(SIZE_PICTURES, random).slice(0, LUKE_TASKS_PER_GAME);
  return shuffleWith(SIZES, random).slice(0, LUKE_TASKS_PER_GAME).map((size, index) => ({
    item: pictures[index], size, choices: shuffleWith(SIZES, random),
  }));
}

// An everyday object, animal or vehicle is shown above two pictures.
export function createSameRounds(random: Random = Math.random): SameRound[] {
  return shuffleWith(MATCH_PICTURES, random).slice(0, LUKE_TASKS_PER_GAME).map(item => ({
    item, choices: shuffleWith([item, other(MATCH_PICTURES, item, random)], random),
  }));
}

export const LUKE_TAP_PROMPTS: readonly string[] = [
  ...ANIMALS.flatMap(animal => [animal.prompt, animal.sound]),
  ...SIZE_PICTURES.flatMap(item => [item.big, item.small]),
  SAME_PROMPT,
  ...MATCH_PICTURES.flatMap(item => [item.praise, item.hint]),
];
