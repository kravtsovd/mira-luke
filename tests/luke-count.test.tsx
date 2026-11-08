// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LukeCountGame from "../app/components/LukeCountGame";
import {
  createLukeCountBoard, LUKE_COUNTS, LUKE_COUNT_LAUNCH_DATE, LUKE_COUNT_PRAISE,
  LUKE_COUNT_VARIANT, LUKE_COUNT_WRONG_VOICE, LUKE_GROUPS_PER_GAME, LukeCount,
} from "../app/lib/luke-count";
import { LUKE_TASKS_PER_GAME } from "../app/lib/luke-tasks";
import { availableGames, profileSettings } from "../app/lib/profiles";
import { GAME_LABELS } from "../app/lib/game-labels";
import { SPEECH_AUDIO_PATHS } from "../app/lib/speech";

const speech = vi.hoisted(() => ({ speak: vi.fn(), stop: vi.fn() }));
const analytics = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("../app/lib/speech", async importOriginal => ({
  ...(await importOriginal<typeof import("../app/lib/speech")>()),
  speakRussian: speech.speak,
  stopSpeaking: speech.stop,
}));
vi.mock("../app/lib/analytics", () => ({ track: analytics.track, analyticsContext: () => ({ profile: "luke" }) }));

const events = (name: string) => analytics.track.mock.calls.filter(call => call[0] === name).map(call => call[1]);
const spoken = () => speech.speak.mock.calls.map(call => String(call[0]));
const button = (id: string) => screen.getByTestId(id) as HTMLButtonElement;
const boysIn = (count: number) => button(`lukes-${count}`).querySelectorAll(".luke-boy").length;
const carsIn = (count: number) => button(`cars-${count}`).querySelectorAll(".luke-car").length;
/** The groups of boys on this board, in the order they stand; which two of the three counts is random per game. */
const lukesOnBoard = () => screen.getAllByTestId(/^lukes-/).map(card => Number((card as HTMLElement).dataset.count) as LukeCount);
const notOnBoard = () => LUKE_COUNTS.find(count => !lukesOnBoard().includes(count))!;

// jsdom has no hit testing, so the drop target is whatever the test says is under the finger.
let dropTarget: Element | null = null;

/** Drags a group of boys onto a group of cars the way a finger does: press, move past the threshold, release. */
function dragLukes(lukes: number, onto: number) {
  const source = button(`lukes-${lukes}`);
  dropTarget = button(`cars-${onto}`);
  act(() => {
    fireEvent.pointerDown(source, { isPrimary: true, button: 0, pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(source, { pointerId: 1, clientX: 120, clientY: 220 });
    fireEvent.pointerUp(source, { pointerId: 1, clientX: 120, clientY: 220 });
  });
}

function dragAll() {
  for (const count of lukesOnBoard()) dragLukes(count, count);
}

beforeEach(() => {
  vi.useFakeTimers();
  dropTarget = null;
  Object.defineProperty(document, "elementFromPoint", { value: () => dropTarget, configurable: true, writable: true });
  speech.speak.mockReset();
  speech.stop.mockReset();
  analytics.track.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Luke's counting game", () => {
  it("seats two groups of boys into two groups of cars, the same pair of counts, different each game", () => {
    expect(LUKE_GROUPS_PER_GAME).toBe(LUKE_TASKS_PER_GAME);
    expect(LUKE_GROUPS_PER_GAME).toBe(2);
    let differentOrder = 0;
    const pairs = new Set<string>();
    for (let session = 0; session < 60; session++) {
      const board = createLukeCountBoard();
      expect(board.lukes).toHaveLength(2);
      expect(new Set(board.lukes).size).toBe(2);
      for (const count of board.lukes) expect(LUKE_COUNTS).toContain(count);
      expect([...board.cars].sort()).toEqual([...board.lukes].sort());
      if (board.lukes.join() !== board.cars.join()) differentOrder++;
      pairs.add([...board.lukes].sort().join());
    }
    expect(differentOrder).toBeGreaterThan(0);
    expect(pairs.size).toBe(3);
  });

  it("shows two groups of boys and the two matching groups of cars, the right number in each", () => {
    render(<LukeCountGame soundEnabled onSolved={vi.fn()} onComplete={vi.fn()} />);
    expect(lukesOnBoard()).toHaveLength(2);
    expect(screen.getAllByTestId(/^cars-/)).toHaveLength(2);
    for (const count of lukesOnBoard()) { expect(boysIn(count)).toBe(count); expect(carsIn(count)).toBe(count); }
    expect(screen.queryByTestId(`cars-${notOnBoard()}`)).toBeNull();
    expect(screen.getByLabelText("Соединено 0 из 2")).toBeTruthy();
  });

  it("belongs to Luke only and is listed for parents", () => {
    expect(availableGames("luke")).toContain("luke-count");
    expect(availableGames("mira")).not.toContain("luke-count");
    expect(profileSettings("mira", { enabledGames: ["luke-count"] }).enabledGames).not.toContain("luke-count");
    expect(profileSettings("luke", { enabledGames: ["luke-count"] }).enabledGames).toEqual(["luke-count"]);
    expect(GAME_LABELS["luke-count"].title).toBeTruthy();
  });

  it("joins each group to the same number of cars when dragged onto it", () => {
    const onSolved = vi.fn(), onComplete = vi.fn();
    render(<LukeCountGame soundEnabled onSolved={onSolved} onComplete={onComplete} />);

    dragAll();

    expect(events("game_answered")).toHaveLength(2);
    for (const properties of events("game_answered")) expect(properties).toMatchObject({ correct: true, method: "drag" });
    for (const count of lukesOnBoard()) {
      expect(button(`lukes-${count}`).disabled).toBe(true);
      expect(button(`cars-${count}`).disabled).toBe(true);
    }
    expect(onSolved).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("leaves the boys sitting in the cars they were dragged to", () => {
    render(<LukeCountGame soundEnabled onSolved={vi.fn()} onComplete={vi.fn()} />);
    const [first, second] = lukesOnBoard();
    expect(button(`cars-${first}`).querySelectorAll(".luke-boy")).toHaveLength(0);

    dragLukes(first, first);

    // One boy per car in the group he joined, and none in the groups still waiting.
    expect(button(`cars-${first}`).querySelectorAll(".luke-count-rider .luke-boy")).toHaveLength(first);
    expect(button(`cars-${second}`).querySelectorAll(".luke-boy")).toHaveLength(0);
    expect(button(`cars-${first}`).getAttribute("aria-label")).toBe(`Люки в машинках, ${first}`);
  });

  it("rejects a drop on a group of the wrong size and leaves both cards playable", () => {
    render(<LukeCountGame soundEnabled onSolved={vi.fn()} onComplete={vi.fn()} />);
    const [first, second] = lukesOnBoard();
    speech.speak.mockClear();
    dragLukes(first, second);

    expect(events("game_answered").filter(properties => properties.correct === false)).toHaveLength(1);
    expect(spoken()).toEqual([LUKE_COUNT_WRONG_VOICE]);
    expect(button(`cars-${second}`).disabled).toBe(false);
    dragLukes(first, first);
    expect(button(`cars-${first}`).disabled).toBe(true);
  });

  it("ignores a tap that never moved, so a stray finger changes nothing", () => {
    render(<LukeCountGame soundEnabled onSolved={vi.fn()} onComplete={vi.fn()} />);
    const [first] = lukesOnBoard();
    const source = button(`lukes-${first}`);
    act(() => {
      fireEvent.pointerDown(source, { isPrimary: true, button: 0, pointerId: 1, clientX: 10, clientY: 10 });
      fireEvent.pointerUp(source, { pointerId: 1, clientX: 11, clientY: 11 });
    });

    expect(events("game_answered")).toEqual([]);
    expect(button(`lukes-${first}`).disabled).toBe(false);
  });

  it("drops nowhere without complaining when the finger lands off the cars", () => {
    render(<LukeCountGame soundEnabled onSolved={vi.fn()} onComplete={vi.fn()} />);
    const [first] = lukesOnBoard();
    const source = button(`lukes-${first}`);
    dropTarget = document.body;
    act(() => {
      fireEvent.pointerDown(source, { isPrimary: true, button: 0, pointerId: 1, clientX: 10, clientY: 10 });
      fireEvent.pointerMove(source, { pointerId: 1, clientX: 300, clientY: 400 });
      fireEvent.pointerUp(source, { pointerId: 1, clientX: 300, clientY: 400 });
    });

    expect(events("game_answered")).toEqual([]);
    expect(button(`lukes-${first}`).disabled).toBe(false);
  });

  it("can still be played from the keyboard: pick up, then drop", () => {
    render(<LukeCountGame soundEnabled onSolved={vi.fn()} onComplete={vi.fn()} />);
    const [first] = lukesOnBoard();
    act(() => { fireEvent.keyDown(button(`lukes-${first}`), { key: "Enter" }); });
    act(() => { fireEvent.keyDown(button(`cars-${first}`), { key: "Enter" }); });

    expect(events("game_answered")).toMatchObject([{ correct: true, method: "key" }]);
    expect(button(`cars-${first}`).disabled).toBe(true);
  });

  it("never says the number out loud", () => {
    render(<LukeCountGame soundEnabled onSolved={vi.fn()} onComplete={vi.fn()} />);
    dragAll();

    for (const phrase of spoken()) expect(phrase).not.toMatch(/один|два|три|\d/i);
    expect(spoken()).toContain(LUKE_COUNT_PRAISE);
  });

  it("stamps every event with the variant and its launch date", () => {
    render(<LukeCountGame soundEnabled onSolved={vi.fn()} onComplete={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Повторить задание голосом"));
    dragAll();

    const stamp = { game: "luke-count", game_variant: LUKE_COUNT_VARIANT, launch_date: LUKE_COUNT_LAUNCH_DATE };
    for (const event of ["game_started", "game_answered", "game_completed", "game_instruction_repeated"]) {
      expect(events(event).length).toBeGreaterThan(0);
      for (const properties of events(event)) expect(properties).toMatchObject(stamp);
    }
    expect(events("game_instruction_repeated")[0]).toMatchObject({ repeat_mode: "voice" });
  });

  it("says its two spoken lines with the recorded voice, not the system one", () => {
    for (const phrase of [LUKE_COUNT_PRAISE, LUKE_COUNT_WRONG_VOICE]) {
      expect(SPEECH_AUDIO_PATHS[phrase], phrase).toBeTruthy();
    }
  });
});
