

export const ANIMALS = ["cat", "dog", "cow", "pig", "duck", "horse", "sheep", "chicken"] as const;
export type Animal = (typeof ANIMALS)[number];
export const COLORS = ["red", "blue", "yellow", "green"] as const;
export type Color = (typeof COLORS)[number];
export const ITEMS = ["ball", "balloon"] as const;
export type Item = (typeof ITEMS)[number];
export const COUNT_ANIMALS = ["duck", "pig", "chicken", "sheep"] as const satisfies readonly Animal[];
export type CountAnimal = (typeof COUNT_ANIMALS)[number];

export type Target =
  | { kind: "animal"; animal: Animal }
  | { kind: "item"; item: Item; color: Color }
  | { kind: "group"; animal: CountAnimal; count: 1 | 2 | 3 };

export const LEVELS = [
  { level: 1, id: "en-find-l1-3-animals", title: "3 животных", pool: ["cat", "dog", "cow", "pig"] as Animal[], shown: 3 },
  { level: 2, id: "en-find-l2-6-animals", title: "6 животных", pool: [...ANIMALS], shown: 6 },
  { level: 3, id: "en-find-l3-color-object", title: "цвет + предмет", pool: [], shown: 6 },
  { level: 4, id: "en-find-l4-count", title: "число + животное", pool: [], shown: 4 },
] as const;
export type LevelNumber = 1 | 2 | 3 | 4;
export const STARS_TO_PASS = 3;
export const TASKS_PER_BREAK = 3;

export interface Placed { key: string; target: Target; left: number; top: number; height: number }
export interface Task { level: LevelNumber; levelId: string; target: Target; scene: Placed[] }

type Random = () => number;
const pick = <T,>(list: readonly T[], random: Random): T => list[Math.min(list.length - 1, Math.floor(random() * list.length))];
function shuffle<T>(list: readonly T[], random: Random): T[] {
  const copy = [...list];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

const NUMBER_WORDS = ["", "one", "two", "three"] as const;
const plural = (animal: CountAnimal, count: number) => count === 1 || animal === "sheep" ? animal : `${animal}s`;

export function targetKey(target: Target): string {
  if (target.kind === "animal") return target.animal;
  if (target.kind === "item") return `${target.item}-${target.color}`;
  return `${target.count}-${target.animal}`;
}

export function targetWords(target: Target): string {
  if (target.kind === "animal") return `the ${target.animal}`;
  if (target.kind === "item") return `the ${target.color} ${target.item}`;
  return `${NUMBER_WORDS[target.count]} ${plural(target.animal, target.count)}`;
}

const capital = (text: string) => text[0].toUpperCase() + text.slice(1);
export const findPhrase = (target: Target) => `Find ${targetWords(target)}!`;
export const wrongPhrase = (target: Target) => `That's ${targetWords(target)}.`;
export const rightPhrase = (target: Target) => `Yes! ${capital(targetWords(target))}!`;
// Progress talk is in Russian: the game words are the English lesson, the rules must be understood for sure.
const ROUNDS_LEFT = ["", "Ещё один раунд без ошибок, и будет новая игра!", "Ещё два раунда без ошибок, и будет новая игра!"];
// After a clean round there is at least one star, so at most two clean rounds are ever left.
export const roundStarPhrase = (roundsLeft: number) => `Ура, звёздочка! ${ROUNDS_LEFT[Math.min(STARS_TO_PASS - 1, Math.max(1, roundsLeft))]}`;
export const ROUND_NO_STAR_PHRASE = "В этот раз без звёздочки. Найди всё без ошибок, и будет звёздочка!";
export const LEVEL_UP_PHRASE = "Три звёздочки! Открываем новую игру!";
export const MASTERED_PHRASE = "Три звёздочки! Ты знаешь всю ферму!";

// Feet positions in % of the 16:9 meadow; the sky above holds the instruction. Sizes are heights, so a tall balloon
// and a wide cow read the same size; rows are spaced so a back-row sticker never hides behind a front-row one.
const SLOTS: Record<number, [number, number][]> = {
  3: [[20, 80], [50, 86], [80, 80]],
  4: [[25, 61], [73, 61], [27, 93], [75, 93]],
  6: [[13, 62], [38, 61], [63, 62], [88, 61], [27, 92], [74, 92]],
};

function place(targets: Target[], random: Random, height: number): Placed[] {
  const slots = shuffle(SLOTS[targets.length], random);
  return targets.map((target, index) => ({ key: targetKey(target), target, left: slots[index][0], top: slots[index][1], height }));
}

export function makeTask(level: LevelNumber, random: Random = Math.random, avoidKey?: string): Task {
  const spec = LEVELS[level - 1];
  let target: Target;
  let others: Target[];
  let height = 26;
  if (level <= 2) {
    const candidates = spec.pool.filter(animal => animal !== avoidKey);
    const chosen = pick(candidates, random);
    target = { kind: "animal", animal: chosen };
    others = shuffle(spec.pool.filter(animal => animal !== chosen), random).slice(0, spec.shown - 1).map(animal => ({ kind: "animal" as const, animal }));
    height = level === 1 ? 36 : 26;
  } else if (level === 3) {
    let item: Item, color: Color;
    do { item = pick(ITEMS, random); color = pick(COLORS, random); } while (`${item}-${color}` === avoidKey);
    target = { kind: "item", item, color };
    // The near misses make both words matter: same object in another colour, same colour on the other object.
    const otherColor = pick(COLORS.filter(value => value !== color), random);
    const otherItem: Item = item === "ball" ? "balloon" : "ball";
    const thirdColor = pick(COLORS.filter(value => value !== color && value !== otherColor), random);
    const animals = shuffle(ANIMALS, random).slice(0, 2).map(animal => ({ kind: "animal" as const, animal }));
    others = [
      { kind: "item", item, color: otherColor },
      { kind: "item", item: otherItem, color },
      { kind: "item", item: otherItem, color: thirdColor },
      ...animals,
    ];
    height = 25;
  } else {
    let animal: CountAnimal, count: 1 | 2 | 3;
    do { animal = pick(COUNT_ANIMALS, random); count = pick([1, 2, 3] as const, random); } while (`${count}-${animal}` === avoidKey);
    target = { kind: "group", animal, count };
    const otherCounts = shuffle(([1, 2, 3] as const).filter(value => value !== count), random);
    const otherAnimal = pick(COUNT_ANIMALS.filter(value => value !== animal), random);
    others = [
      { kind: "group", animal, count: otherCounts[0] },
      { kind: "group", animal, count: otherCounts[1] },
      { kind: "group", animal: otherAnimal, count },
    ];
    height = 29;
  }
  return { level, levelId: spec.id, target, scene: place([target, ...others], random, height) };
}

export function allPhrases(): string[] {
  const targets: Target[] = [
    ...ANIMALS.map(animal => ({ kind: "animal" as const, animal })),
    ...ITEMS.flatMap(item => COLORS.map(color => ({ kind: "item" as const, item, color }))),
    ...COUNT_ANIMALS.flatMap(animal => ([1, 2, 3] as const).map(count => ({ kind: "group" as const, animal, count }))),
  ];
  return targets.flatMap(target => [findPhrase(target), wrongPhrase(target), rightPhrase(target)]);
}

export function progressPhrases(): string[] {
  return [1, 2].map(roundStarPhrase).concat(ROUND_NO_STAR_PHRASE, LEVEL_UP_PHRASE, MASTERED_PHRASE);
}

export type LevelStats = Record<LevelNumber, { clean: number; miss: number }>;
export interface EnglishProgress {
  level: LevelNumber; stars: number; streak: number; mastered: boolean; rounds: number; cleanRounds: number; levels: LevelStats;
}
export const ENGLISH_PROGRESS_KEY = "mira-english-find-v2";
const emptyLevels = (): LevelStats => ({ 1: { clean: 0, miss: 0 }, 2: { clean: 0, miss: 0 }, 3: { clean: 0, miss: 0 }, 4: { clean: 0, miss: 0 } });
export const START_PROGRESS: EnglishProgress = { level: 1, stars: 0, streak: 0, mastered: false, rounds: 0, cleanRounds: 0, levels: emptyLevels() };
export const freshProgress = (level: LevelNumber = 1, stars = 0): EnglishProgress => ({ ...START_PROGRESS, level, stars, levels: emptyLevels() });

const count = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : 0;

// One parser for this device's cache and for the shared copy from the server; anything malformed is rejected whole.
export function parseEnglishProgress(value: unknown): EnglishProgress | null {
  const row = value as Partial<EnglishProgress> | null;
  if (!row || typeof row !== "object" || ![1, 2, 3, 4].includes(row.level as number) || !Number.isSafeInteger(row.stars)
    || (row.stars as number) < 0 || !Number.isSafeInteger(row.rounds) || !Number.isSafeInteger(row.cleanRounds)) return null;
  // Records saved before streaks and per-level counts existed keep their stars and start those counts at zero.
  const levels = emptyLevels();
  const source = row.levels as Partial<LevelStats> | undefined;
  for (const level of [1, 2, 3, 4] as LevelNumber[]) levels[level] = { clean: count(source?.[level]?.clean), miss: count(source?.[level]?.miss) };
  // Progress saved while a level took five stars may hold 3-4; it waits one clean round instead of being thrown away.
  return { level: row.level as LevelNumber, stars: Math.min(STARS_TO_PASS - 1, row.stars as number), streak: count(row.streak), mastered: row.mastered === true,
    rounds: row.rounds as number, cleanRounds: row.cleanRounds as number, levels };
}

export function readEnglishProgress(): EnglishProgress {
  if (typeof window === "undefined") return freshProgress();
  try { return parseEnglishProgress(JSON.parse(window.localStorage.getItem(ENGLISH_PROGRESS_KEY) || "null")) ?? freshProgress(); }
  catch { return freshProgress(); }
}

export function saveEnglishProgress(progress: EnglishProgress): void {
  try { window.localStorage.setItem(ENGLISH_PROGRESS_KEY, JSON.stringify(progress)); } catch { /* Game still works without storage. */ }
}

export const roundsToPass = (progress: EnglishProgress) => STARS_TO_PASS - progress.stars;

// the maintainer's rules (2026-10-02; 2026-10-11: three stars, no streak shortcut): a clean round +1 star; a round with a mistake -1 star
// (never below zero). Three stars pass the level. The clean-round streak is still counted for statistics.
export function scoreRound(progress: EnglishProgress, clean: boolean): { progress: EnglishProgress; levelUp: boolean; reason: "stars" | null } {
  const stars = clean ? progress.stars + 1 : Math.max(0, progress.stars - 1);
  const streak = clean ? progress.streak + 1 : 0;
  const levels = { ...progress.levels, [progress.level]: { ...progress.levels[progress.level] } } as LevelStats;
  levels[progress.level][clean ? "clean" : "miss"] += 1;
  const base = { ...progress, rounds: progress.rounds + 1, cleanRounds: progress.cleanRounds + Number(clean), levels };
  const reason = stars >= STARS_TO_PASS ? "stars" : null;
  if (!reason) return { progress: { ...base, stars, streak }, levelUp: false, reason };
  if (progress.level < 4) return { progress: { ...base, level: (progress.level + 1) as LevelNumber, stars: 0, streak: 0 }, levelUp: true, reason };
  return { progress: { ...base, stars: 0, streak: 0, mastered: true }, levelUp: true, reason };
}

export interface RoundResult { id: string; level: LevelNumber; clean: boolean }

export function applyRound(progress: EnglishProgress, round: RoundResult): ReturnType<typeof scoreRound> {
  if (round.level === progress.level) return scoreRound(progress, round.clean);
  const levels = { ...progress.levels, [round.level]: { ...progress.levels[round.level] } } as LevelStats;
  levels[round.level][round.clean ? "clean" : "miss"] += 1;
  return { progress: { ...progress, rounds: progress.rounds + 1, cleanRounds: progress.cleanRounds + Number(round.clean), levels }, levelUp: false, reason: null };
}
