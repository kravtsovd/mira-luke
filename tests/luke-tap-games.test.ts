import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ANIMALS, animalImage, createAnimalRounds, createSameRounds, createSizeRounds, LUKE_TAP_GAMES, LUKE_TAP_PROMPTS, SAME_PROMPT, SIZES,
} from "../app/lib/luke-tap-games";
import { CAR_PUZZLE_GAME, PUZZLE_HALVES, PUZZLE_VEHICLES, CAR_PUZZLE_ROUNDS, createCarPuzzleRounds } from "../app/lib/car-puzzle";
import { LUKE_TASKS_PER_GAME } from "../app/lib/luke-tasks";
import { availableGames, profileSettings } from "../app/lib/profiles";
import { GAME_LABELS } from "../app/lib/game-labels";
import { SPEECH_AUDIO_PATHS } from "../app/lib/speech";
import { MATCH_PICTURES, OBJECTS, SIZE_PICTURES } from "../app/lib/luke-pictures";
import manifest from "../app/lib/voice-manifest.json";

// A small seeded generator: a constant "random" would shuffle every list the same way and hide the ordering bugs.
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 2 ** 32; };
}
const seeds = Array.from({ length: 200 }, (_, i) => seeded(i + 1));

describe("Luke's animal, size and same-car tap games", () => {
  it("asks exactly two things with exactly two pictures each", () => {
    expect(LUKE_TASKS_PER_GAME).toBe(2);
    for (const random of seeds) {
      for (const rounds of [createAnimalRounds(random), createSizeRounds(random), createSameRounds(random)]) {
        expect(rounds).toHaveLength(LUKE_TASKS_PER_GAME);
        for (const round of rounds) expect(round.choices).toHaveLength(2);
      }
    }
  });
  it("names a different animal each round, offers it among two, and never tempts with the previous answer", () => {
    for (const random of seeds) {
      const rounds = createAnimalRounds(random);
      expect(rounds[0].animal.id).not.toBe(rounds[1].animal.id);
      rounds.forEach((round, index) => {
        expect(round.choices.filter(a => a.id === round.animal.id)).toHaveLength(1);
        expect(new Set(round.choices.map(a => a.id)).size).toBe(2);
        if (index > 0) expect(round.choices.map(a => a.id)).not.toContain(rounds[index - 1].animal.id);
      });
    }
  });
  it("shows both sizes once per game on the same vehicle twice, in either order", () => {
    const first = new Set<string>();
    for (const random of seeds) {
      const rounds = createSizeRounds(random);
      expect(rounds.map(r => r.size.id).sort()).toEqual(["big", "small"]);
      expect(rounds[0].item.id).not.toBe(rounds[1].item.id);
      for (const round of rounds) expect(round.choices.map(c => c.id).sort()).toEqual(["big", "small"]);
      first.add(rounds[0].size.id + rounds[0].choices[0].id);
    }
    expect(first.size).toBe(4);
  });
  it("puts the sample vehicle among two distinct choices, a different sample each round", () => {
    for (const random of seeds) {
      const rounds = createSameRounds(random);
      expect(rounds[0].item.id).not.toBe(rounds[1].item.id);
      for (const round of rounds) {
        expect(new Set(round.choices.map(v => v.id)).size).toBe(2);
        expect(round.choices.filter(v => v.id === round.item.id)).toHaveLength(1);
      }
    }
  });
  it("ships a sticker for every animal", () => {
    for (const animal of ANIMALS) expect(existsSync(join(process.cwd(), "public", animalImage(animal.id))), animal.id).toBe(true);
  });
  it("maps every prompt and animal answer to device speech", () => {
    expect(LUKE_TAP_PROMPTS).toEqual([...ANIMALS.flatMap(a => [a.prompt, a.sound]), ...SIZE_PICTURES.flatMap(p => [p.big, p.small]), SAME_PROMPT, ...MATCH_PICTURES.flatMap(p => [p.praise, p.hint])]);
    const required = [...LUKE_TAP_PROMPTS, ...PUZZLE_VEHICLES.map(p => p.prompt)];
    for (const text of required) {
      expect(SPEECH_AUDIO_PATHS[text], `Missing speech phrase: ${text}`).toBeDefined();
      expect(SPEECH_AUDIO_PATHS[text], text).toMatch(/^tts:/);
      expect((manifest.durations_ms as Record<string, number>)[text], text).toBeGreaterThan(0);
    }
  });
  it("belongs to Luke and toddlers only, with labels, and stays out of Mira's settings even when forged", () => {
    for (const game of [...LUKE_TAP_GAMES, CAR_PUZZLE_GAME] as const) {
      expect(GAME_LABELS[game].title).toBeTruthy();
      expect(availableGames("luke")).toContain(game);
      expect(availableGames("kid", "toddler")).toContain(game);
      expect(availableGames("mira")).not.toContain(game);
      expect(availableGames("kid", "preschool")).not.toContain(game);
      expect(profileSettings("mira", { enabledGames: [game] }).enabledGames).not.toContain(game);
      expect(profileSettings("luke", { enabledGames: [game] }).enabledGames).toEqual([game]);
    }
  });
});

describe("Luke's two-half puzzle", () => {
  it("has two distinct vehicles, two shuffled halves, and a specific instruction for each vehicle", () => {
    expect(CAR_PUZZLE_ROUNDS).toBe(2);
    const firsts = new Set<string>();
    for (const random of seeds) {
      const rounds = createCarPuzzleRounds(random);
      expect(rounds).toHaveLength(2);
      expect(rounds[0].id).not.toBe(rounds[1].id);
      for (const round of rounds) {
        expect([...round.pieces].sort()).toEqual([...PUZZLE_HALVES]);
        expect(round.prompt).toMatch(/^Собери /);
        expect(existsSync(join(process.cwd(), "public", round.image))).toBe(true);
        firsts.add(round.pieces[0]);
      }
    }
    expect(firsts.size).toBe(2);
  });
});

it("includes all eight chosen objects, their correct Russian size names and animals in matching", () => {
  expect(OBJECTS.map(p => p.id)).toEqual(["apple", "banana", "ball", "teddy", "cup", "chair", "tree", "flower"]);
  expect(SIZE_PICTURES.find(p => p.id === "bus")?.big).toBe("Найди большой автобус");
  expect(OBJECTS[0].small).toBe("Найди маленькое яблоко");
  expect(MATCH_PICTURES.some(p => p.id === "cow")).toBe(true);
  const used = new Set<string>();
  for (let n = 1; n <= 200; n++) {
    for (const round of createSizeRounds(seeded(n))) used.add(round.item.id);
  }
  expect(used.size).toBe(SIZE_PICTURES.length);
  for (const picture of MATCH_PICTURES) expect(existsSync(join(process.cwd(), "public", picture.image)), picture.id).toBe(true);
});

it("prepares every new spoken line for the recording command", () => {
  for (const item of MATCH_PICTURES) {
    expect(item.praise).toBe(`Молодец! Это ${item.name.toLowerCase()}.`);
    expect(item.hint).toMatch(/^Найди такую же картинку /);
  }
  expect(MATCH_PICTURES.find(p => p.id === "tree")?.hint).toBe("Найди такую же картинку дерева");
});
