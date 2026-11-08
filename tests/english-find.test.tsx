// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import manifest from "../app/lib/voice-manifest.json";
import {
  ENGLISH_PROGRESS_KEY, LEVELS, START_PROGRESS, STARS_TO_PASS, freshProgress, allPhrases, findPhrase, makeTask, progressPhrases, readEnglishProgress, scoreRound, targetKey,
} from "../app/lib/english-find";
import EnglishFindGame from "../app/components/EnglishFindGame";

const speech = vi.hoisted(() => ({ speak: vi.fn(), stop: vi.fn() }));
const analytics = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("../app/lib/speech", async (importOriginal) => ({ ...await importOriginal<typeof import("../app/lib/speech")>(), speakRussian: speech.speak, stopSpeaking: speech.stop, preloadVoices: vi.fn() }));
vi.mock("../app/lib/analytics", () => ({ track: analytics.track, analyticsContext: () => ({ profile: "mira" }) }));

beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); speech.speak.mockReset(); analytics.track.mockReset(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("English find rules", () => {
  it("passes a level by three stars and counts good and bad rounds per level", () => {
    expect(STARS_TO_PASS).toBe(3);
    let progress = freshProgress();
    for (let round = 0; round < 2; round++) {
      const scored = scoreRound(progress, true);
      expect(scored.levelUp).toBe(false);
      progress = scored.progress;
    }
    expect(progress).toMatchObject({ level: 1, stars: 2, streak: 2 });
    const third = scoreRound(progress, true);
    expect(third).toMatchObject({ levelUp: true, reason: "stars", progress: { level: 2, stars: 0, streak: 0 } });
    expect(third.progress.levels[1]).toEqual({ clean: 3, miss: 0 });

    // A miss restarts the streak and costs a star.
    let mixed = freshProgress();
    for (const clean of [true, true, false, true, true]) {
      const scored = scoreRound(mixed, clean);
      if (scored.levelUp) { expect(scored.reason).toBe("stars"); mixed = scored.progress; break; }
      mixed = scored.progress;
    }
    expect(mixed).toMatchObject({ level: 2, stars: 0 });
    expect(mixed.levels[1]).toEqual({ clean: 4, miss: 1 });
    expect(scoreRound(freshProgress(), false).progress).toMatchObject({ stars: 0, streak: 0, levels: { 1: { clean: 0, miss: 1 } } });
    const top = scoreRound(freshProgress(4, STARS_TO_PASS - 1), true);
    expect(top).toMatchObject({ levelUp: true, reason: "stars", progress: { level: 4, stars: 0, mastered: true } });
  });

  it("keeps stars from records saved before streaks existed", () => {
    localStorage.setItem(ENGLISH_PROGRESS_KEY, JSON.stringify({ level: 2, stars: 2, mastered: false, rounds: 4, cleanRounds: 3 }));
    expect(readEnglishProgress()).toMatchObject({ level: 2, stars: 2, streak: 0, levels: { 2: { clean: 0, miss: 0 } } });
  });

  it("keeps a record saved under the five-star rule one clean round away from the next level", () => {
    localStorage.setItem(ENGLISH_PROGRESS_KEY, JSON.stringify({ level: 1, stars: 4, streak: 1, mastered: false, rounds: 6, cleanRounds: 5 }));
    const saved = readEnglishProgress();
    expect(saved).toMatchObject({ level: 1, stars: 2, rounds: 6 });
    expect(scoreRound(saved, true)).toMatchObject({ levelUp: true, progress: { level: 2 } });
  });

  it("builds every level with one correct sticker, distinct keys and near misses that make both words matter", () => {
    for (const { level } of LEVELS) {
      for (let seed = 0; seed < 200; seed++) {
        let state = seed * 7919 + level;
        const random = () => ((state = (state * 48271) % 2147483647) / 2147483647);
        const task = makeTask(level, random);
        const keys = task.scene.map(item => item.key);
        expect(new Set(keys).size).toBe(keys.length);
        expect(keys.filter(key => key === targetKey(task.target))).toHaveLength(1);
        expect(task.scene).toHaveLength(LEVELS[level - 1].shown);
        if (task.target.kind === "item") {
          const { item, color } = task.target;
          expect(task.scene.some(p => p.target.kind === "item" && p.target.item === item && p.target.color !== color)).toBe(true);
          expect(task.scene.some(p => p.target.kind === "item" && p.target.item !== item && p.target.color === color)).toBe(true);
        }
        if (task.target.kind === "group") {
          const { animal, count } = task.target;
          expect(task.scene.some(p => p.target.kind === "group" && p.target.animal === animal && p.target.count !== count)).toBe(true);
          expect(task.scene.some(p => p.target.kind === "group" && p.target.animal !== animal && p.target.count === count)).toBe(true);
        }
      }
    }
  });

  it("never repeats the previous target and speaks available device-speech phrases", () => {
    for (let index = 0; index < 50; index++) expect(targetKey(makeTask(1, Math.random, "cat").target)).not.toBe("cat");
    const phrases: Record<string, string> = manifest.phrases;
    for (const text of allPhrases()) expect(phrases[text], text).toMatch(/^tts:/);
    for (const text of progressPhrases()) expect(phrases[text], text).toMatch(/^tts:/);
  });

  it("restarts at level one when the stored record is broken", () => {
    localStorage.setItem(ENGLISH_PROGRESS_KEY, JSON.stringify({ level: 9, stars: 2, rounds: 1, cleanRounds: 1 }));
    expect(readEnglishProgress()).toEqual(freshProgress());
  });
});

describe("English find game", () => {
  const target = () => screen.getByTestId("english-find-game").dataset.target!;
  const stars = () => Number(screen.getByTestId("english-stars").dataset.stars);
  const seed = (progress: object) => localStorage.setItem(ENGLISH_PROGRESS_KEY, JSON.stringify({ level: 1, stars: 0, mastered: false, rounds: 0, cleanRounds: 0, ...progress }));
  function solveTask(withMistake = false) {
    const goal = target();
    if (withMistake) {
      const wrong = screen.getAllByRole("button").find(button => button.dataset.testid?.startsWith("sticker-") && button.dataset.testid !== `sticker-${goal}`)!;
      act(() => { fireEvent.click(wrong); });
      expect(speech.speak).toHaveBeenLastCalledWith(`That's the ${wrong.dataset.testid!.slice(8)}.`, true);
    }
    act(() => { fireEvent.click(screen.getByTestId(`sticker-${goal}`)); });
    expect(speech.speak).toHaveBeenLastCalledWith(`Yes! The ${goal}!`, true);
    act(() => { vi.advanceTimersByTime(4000); });
  }

  it("does not change stars inside a round, then a clean round of three adds one and says how many are left", () => {
    seed({ stars: 1, streak: 0 });
    const onSolved = vi.fn(), onComplete = vi.fn();
    render(<EnglishFindGame soundEnabled onSolved={onSolved} onComplete={onComplete} />);
    expect(speech.speak).toHaveBeenCalledWith(`Find the ${target()}!`, true);
    solveTask();
    solveTask();
    expect(stars()).toBe(1);
    solveTask();
    expect(screen.getByTestId("english-summary").dataset.clean).toBe("true");
    expect(screen.getByTestId("english-summary-stars").dataset.stars).toBe("2");
    expect(speech.speak).toHaveBeenLastCalledWith("Ура, звёздочка! Ещё один раунд без ошибок, и будет новая игра!", true);
    expect(screen.getByTestId("english-summary-stats").textContent).toBe("Level 1: удачных раундов 1, неудачных 0");
    expect(readEnglishProgress()).toMatchObject({ level: 1, stars: 2, streak: 1, rounds: 1, cleanRounds: 1 });
    expect(onSolved).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(6000); });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(analytics.track).toHaveBeenCalledWith("game_round_scored", expect.objectContaining({ level_id: "en-find-l1-3-animals", clean: true, stars_after: 2 }));
  });

  it("a mistake anywhere in the round gives no star and goes one back", () => {
    seed({ stars: 2 });
    render(<EnglishFindGame soundEnabled onSolved={vi.fn()} onComplete={vi.fn()} />);
    solveTask();
    solveTask(true);
    solveTask();
    expect(screen.getByTestId("english-summary").dataset.clean).toBe("false");
    expect(speech.speak).toHaveBeenLastCalledWith("В этот раз без звёздочки. Найди всё без ошибок, и будет звёздочка!", true);
    expect(readEnglishProgress()).toMatchObject({ stars: 1, streak: 0, rounds: 1, cleanRounds: 0, levels: { 1: { clean: 0, miss: 1 } } });
    expect(screen.getByTestId("english-summary-stats").textContent).toBe("Level 1: удачных раундов 0, неудачных 1");
    const answers = analytics.track.mock.calls.filter(([event]) => event === "game_answered").map(([, props]) => props);
    expect(answers[1]).toEqual(expect.objectContaining({ game: "english-find", correct: false, first_try: true, round_task: 2, level_id: "en-find-l1-3-animals" }));
  });

  it("the first star says two rounds are left", () => {
    seed({ stars: 0 });
    render(<EnglishFindGame soundEnabled onSolved={vi.fn()} onComplete={vi.fn()} />);
    solveTask(); solveTask(); solveTask();
    expect(speech.speak).toHaveBeenLastCalledWith("Ура, звёздочка! Ещё два раунда без ошибок, и будет новая игра!", true);
  });

  it("the third star opens a new game", () => {
    seed({ stars: 2 });
    render(<EnglishFindGame soundEnabled onSolved={vi.fn()} onComplete={vi.fn()} />);
    solveTask(); solveTask(); solveTask();
    expect(screen.getByTestId("english-summary").dataset.levelUp).toBe("true");
    expect(screen.getByTestId("english-summary").textContent).toContain("Новая игра: Level 2!");
    expect(speech.speak).toHaveBeenLastCalledWith("Три звёздочки! Открываем новую игру!", true);
    expect(readEnglishProgress()).toMatchObject({ level: 2, stars: 0 });
    expect(analytics.track).toHaveBeenCalledWith("game_level_up", expect.objectContaining({ level_id: "en-find-l1-3-animals", next_level: 2 }));
    expect(findPhrase({ kind: "group", animal: "sheep", count: 3 })).toBe("Find three sheep!");
  });
});

describe("English find practice run", () => {
  const target = () => screen.getByTestId("english-find-game").dataset.target!;
  function cleanRound() {
    for (let index = 0; index < 3; index++) {
      act(() => { fireEvent.click(screen.getByTestId(`sticker-${target()}`)); });
      act(() => { vi.advanceTimersByTime(4000); });
    }
  }

  it("starts at the chosen level, jumps levels, plays a level-up and never touches Mira's saved stars", () => {
    const saved = { level: 1, stars: 2, streak: 0, mastered: false, rounds: 7, cleanRounds: 5, levels: { 1: { clean: 5, miss: 2 }, 2: { clean: 0, miss: 0 }, 3: { clean: 0, miss: 0 }, 4: { clean: 0, miss: 0 } } };
    localStorage.setItem(ENGLISH_PROGRESS_KEY, JSON.stringify(saved));
    const onLevelChange = vi.fn();
    render(<EnglishFindGame soundEnabled onSolved={vi.fn()} onComplete={vi.fn()} practice={{ level: 3, onLevelChange }} />);
    expect(screen.getByTestId("english-test-badge")).toBeTruthy();
    expect(screen.getByTestId("english-find-game").dataset.level).toBe("3");
    act(() => { fireEvent.click(screen.getByTestId("practice-level-2")); });
    expect(screen.getByTestId("english-find-game").dataset.level).toBe("2");
    expect(onLevelChange).toHaveBeenLastCalledWith(2);
    act(() => { fireEvent.click(screen.getByTestId("practice-one-star-left")); });
    expect(screen.getByTestId("english-stars").dataset.stars).toBe("2");
    cleanRound();
    expect(screen.getByTestId("english-summary").dataset.levelUp).toBe("true");
    expect(onLevelChange).toHaveBeenLastCalledWith(3);
    expect(JSON.parse(localStorage.getItem(ENGLISH_PROGRESS_KEY)!)).toEqual(saved);
    expect(analytics.track).toHaveBeenCalledWith("game_round_scored", expect.objectContaining({ test_mode: true, clean: true }));
    expect(analytics.track).toHaveBeenCalledWith("game_answered", expect.objectContaining({ test_mode: true }));
  });

  it("a launcher check without a level shows Mira's current level and stars but saves nothing", () => {
    const saved = { level: 2, stars: 1, streak: 0, mastered: false, rounds: 7, cleanRounds: 5, levels: { 1: { clean: 5, miss: 2 }, 2: { clean: 0, miss: 0 }, 3: { clean: 0, miss: 0 }, 4: { clean: 0, miss: 0 } } };
    localStorage.setItem(ENGLISH_PROGRESS_KEY, JSON.stringify(saved));
    render(<EnglishFindGame soundEnabled onSolved={vi.fn()} onComplete={vi.fn()} practice={{}} />);
    expect(screen.getByTestId("english-find-game").dataset.level).toBe("2");
    expect(screen.getByTestId("english-stars").dataset.stars).toBe("1");
    cleanRound();
    expect(screen.getByTestId("english-summary-stars").dataset.stars).toBe("2");
    expect(JSON.parse(localStorage.getItem(ENGLISH_PROGRESS_KEY)!)).toEqual(saved);
  });
});
