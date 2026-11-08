// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SPEECH_AUDIO_PATHS } from "../app/lib/speech";
import { voiceDelay } from "../app/lib/voice-timing";
import CarPeopleGame from "../app/components/CarPeopleGame";
import { CAR_PEOPLE_ROUNDS } from "../app/lib/car-people";

const speech = vi.hoisted(() => ({ speak: vi.fn(), stop: vi.fn() }));
vi.mock("../app/lib/speech", async (importOriginal) => ({ ...await importOriginal<typeof import("../app/lib/speech")>(), speakRussian: speech.speak, stopSpeaking: speech.stop, preloadVoices: vi.fn() }));
vi.mock("../app/lib/analytics", () => ({ track: vi.fn(), analyticsContext: () => ({ profile: "luke" }) }));

beforeEach(() => { vi.useFakeTimers(); speech.speak.mockReset(); speech.stop.mockReset(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

it("speaks the child and car count in each round and repeats the current instruction", () => {
  render(<CarPeopleGame soundEnabled onSolved={vi.fn()} onComplete={vi.fn()} />);
  const prompts = [
    "",
    "У нас один ребёнок. Дай ему одну машинку.",
    "У нас два ребёнка. Дай им две машинки.",
    "У нас три ребёнка. Дай им три машинки.",
  ];
  const game = screen.getByTestId("car-people-game");
  const played: number[] = [];

  // The rounds come in a random order, so each step reads how many children are on screen from the game itself.
  for (let step = 1; step <= CAR_PEOPLE_ROUNDS; step++) {
    expect(game.dataset.step).toBe(String(step));
    const count = Number(game.dataset.round);
    played.push(count);
    const prompt = prompts[count];
    expect(game.querySelectorAll(".car-people-person")).toHaveLength(count);
    expect(speech.speak).toHaveBeenCalledWith(prompt, true);
    expect(screen.getByText(prompt)).toBeTruthy();
    speech.speak.mockClear();
    act(() => { fireEvent.click(screen.getByTestId("people-group")); });
    expect(speech.speak).toHaveBeenCalledWith(prompt, true);
    speech.speak.mockClear();
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Повторить задание голосом" })); });
    expect(speech.speak).toHaveBeenCalledWith(prompt, true);
    for (const button of screen.getAllByRole("button").filter(button => button.dataset.count && Number(button.dataset.count) !== count)) {
      act(() => { fireEvent.click(button); });
      const text = speech.speak.mock.calls.at(-1)![0];
      expect(SPEECH_AUDIO_PATHS[text], text).toMatch(/^tts:/);
    }
    speech.speak.mockClear();
    act(() => { fireEvent.click(screen.getByTestId(`cars-${count}`)); });
    expect(speech.speak).toHaveBeenCalledWith([
      "",
      "Один ребёнок - одна машинка!",
      "Два ребёнка - две машинки!",
      "Три ребёнка - три машинки!",
    ][count], true);
    for (const [text] of speech.speak.mock.calls) {
      expect(SPEECH_AUDIO_PATHS[text], text).toMatch(/^tts:/);
    }
    expect(SPEECH_AUDIO_PATHS[prompt], prompt).toBeTruthy();
    const praise = speech.speak.mock.calls.at(-1)![0];
    if (step < CAR_PEOPLE_ROUNDS) act(() => { vi.advanceTimersByTime(voiceDelay(praise, true, 1700)); });
  }
  expect(played).toHaveLength(2);
  expect(new Set(played).size).toBe(2);
});
