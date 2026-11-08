// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HuntrixSyllablesGame from "../app/components/HuntrixSyllablesGame";
import MiraHuntrix from "../app/components/MiraHuntrix";
import voiceManifest from "../app/lib/voice-manifest.json";
import { BUILD_NAME_PROMPT, NAME_CARDS, NameId, NAME_GAME_ANALYTICS, nameTiles } from "../app/lib/huntrix";
import { chooseNameRound, NAME_PROGRESS_KEY, nameWeight, readNameProgress, recordNameResult } from "../app/lib/huntrix-progress";

const speech = vi.hoisted(() => ({ speak: vi.fn(), stop: vi.fn(), preload: vi.fn() }));
const analytics = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("../app/lib/speech", () => ({ speakRussian: speech.speak, stopSpeaking: speech.stop, preloadVoices: speech.preload }));
vi.mock("../app/lib/analytics", () => ({ track: analytics.track, analyticsContext: () => ({ profile: "mira" }) }));

const events = (name: string) => analytics.track.mock.calls.filter(call => call[0] === name).map(call => call[1]);
function shownCard() {
  const id = document.querySelector<HTMLImageElement>(".syllables-portrait img")!.dataset.card as NameId;
  return NAME_CARDS.find(card => card.id === id)!;
}
function tap(syllable: string) {
  const tile = screen.getAllByRole("button", { name: syllable }).find(button => !(button as HTMLButtonElement).disabled);
  expect(tile).toBeTruthy();
  fireEvent.click(tile!);
}
function buildName() {
  const card = shownCard();
  for (const syllable of card.syllables) tap(syllable);
  return card.id;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0);
  speech.speak.mockReset(); speech.stop.mockReset(); speech.preload.mockReset(); analytics.track.mockReset();
  window.localStorage.clear();
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("Huntrix syllable rounds", () => {
  it("shows only syllables, records completed names, and finishes after three distinct cards", () => {
    const solved = vi.fn(), complete = vi.fn();
    render(<MiraHuntrix soundEnabled onSolved={solved} onComplete={complete} />);
    expect(screen.queryByText("Найди пары")).toBeNull();
    const seen: NameId[] = [];
    for (let step = 0; step < 3; step++) {
      seen.push(buildName());
      act(() => { vi.advanceTimersByTime(1300); });
    }
    expect(new Set(seen).size).toBe(3);
    expect(solved).toHaveBeenCalledTimes(1);
    expect(events("game_completed")[0]).toMatchObject({ game: "huntrix-syllables", attempts: 6, ...NAME_GAME_ANALYTICS });
    expect(events("game_step_completed")).toHaveLength(3);
    expect(events("game_answered").every(event => !Object.hasOwn(event, "heroine") && !Object.hasOwn(event, "item") && !Object.hasOwn(event, "chosen"))).toBe(true);
    expect(seen.every(id => readNameProgress()[id]?.perfect === 1)).toBe(true);
    act(() => { vi.advanceTimersByTime(1400); });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("resets the current name after an error, ignores rapid retries, and keeps every option", () => {
    render(<HuntrixSyllablesGame soundEnabled onComplete={vi.fn()} />);
    const card = shownCard();
    const tiles = () => Array.from(document.querySelectorAll<HTMLButtonElement>(".syllables-tile"));
    const wrong = tiles().map(tile => tile.textContent!).find(tile => !card.syllables.some(part => part === tile))!;
    tap(card.syllables[0]);
    expect(tiles()).toHaveLength(4);
    expect(tiles().every(tile => !tile.disabled && tile.getAttribute("data-used") !== "true")).toBe(true);
    tap(wrong);
    expect(screen.getByTestId("slot-1").textContent).toBe("");
    expect(screen.getByTestId("slot-2").textContent).toBe("");
    expect(screen.getByText("Попробуем имя сначала")).toBeTruthy();
    tiles().forEach(tile => fireEvent.click(tile));
    expect(events("game_answered")).toHaveLength(2);
    act(() => { vi.advanceTimersByTime(800); });
    expect(shownCard().id).toBe(card.id);
    expect(tiles().every(tile => !tile.disabled)).toBe(true);
    tap(wrong);
    act(() => { vi.advanceTimersByTime(800); });
    expect(document.querySelector('[data-hint="true"]')).toBeNull();
    for (const syllable of card.syllables) tap(syllable);
    expect(readNameProgress()[card.id]).toMatchObject({ rounds: 1, perfect: 0, errors: 2, cleanStreak: 0 });
    expect(events("game_answered").map(event => event.correct)).toEqual([true, false, false, true, true]);
    expect(events("game_answered").at(-1)).toMatchObject({ name_attempt: 3, hinted: false });
    expect(speech.speak.mock.calls[0][0]).toBe(BUILD_NAME_PROMPT);
  });

  it("allows the same syllable again for repeated-syllable names without consuming its tile", () => {
    vi.mocked(Math.random).mockReturnValue(0.5);
    render(<HuntrixSyllablesGame soundEnabled={false} onComplete={vi.fn()} />);
    const card = shownCard();
    expect(card.id).toBe("mama");
    const tile = screen.getAllByRole("button", { name: "МА" })[0];
    fireEvent.click(tile);
    expect((tile as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(tile);
    expect(events("game_step_completed")).toHaveLength(1);
    expect(readNameProgress().mama?.perfect).toBe(1);
  });

  it("preserves earlier completed names when a later name resets", () => {
    render(<HuntrixSyllablesGame soundEnabled={false} onComplete={vi.fn()} />);
    const first = buildName();
    act(() => { vi.advanceTimersByTime(1300); });
    const second = shownCard();
    const wrong = nameTiles(second).find(tile => !second.syllables.some(part => part === tile))!;
    tap(wrong);
    act(() => { vi.advanceTimersByTime(800); });
    expect(readNameProgress()[first]?.perfect).toBe(1);
    expect(events("game_step_completed")).toHaveLength(1);
    expect(shownCard().id).toBe(second.id);
  });

  it("offers four tiles with two simple alternatives for each name", () => {
    for (const card of NAME_CARDS) {
      const tiles = nameTiles(card, () => 0);
      expect(tiles).toHaveLength(4);
      for (const syllable of card.syllables) expect(tiles.filter(tile => tile === syllable)).toHaveLength(card.syllables.filter(part => part === syllable).length);
      expect(tiles.filter(tile => !card.syllables.some(part => part === tile))).toHaveLength(2);
      expect(tiles.every(tile => NAME_CARDS.some(item => item.syllables.some(part => part === tile)))).toBe(true);
    }
    expect(NAME_CARDS.map(card => card.id).join(",")).not.toMatch(/spidey|donnie/);
  });

  it("uses saved errors and clean streaks to change future selection weights", () => {
    recordNameResult("mama", 2);
    recordNameResult("papa", 0);
    recordNameResult("papa", 0);
    const saved = readNameProgress();
    expect(saved.mama).toMatchObject({ rounds: 1, errors: 2 });
    expect(saved.papa).toMatchObject({ rounds: 2, perfect: 2, cleanStreak: 2 });
    expect(nameWeight(saved.mama)).toBeGreaterThan(nameWeight(saved.papa));
    expect(chooseNameRound(saved, () => 0.5)).toHaveLength(3);
    expect(new Set(chooseNameRound(saved, () => 0.5).map(card => card.id)).size).toBe(3);
    expect(window.localStorage.getItem(NAME_PROGRESS_KEY)).toContain("mama");
  });

  it("uses the recorded voice clips where available", () => {
    const paths: Record<string, string> = voiceManifest.phrases;
    for (const syllable of new Set(NAME_CARDS.flatMap(card => [...card.syllables]))) expect(paths[syllable.toLowerCase()]).toMatch(/^tts:/);
  });
});
