// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CarGarageGame from "../app/components/CarGarageGame";
import HuntrixSyllablesGame from "../app/components/HuntrixSyllablesGame";
import LearningGame from "../app/components/LearningGame";
import ToddlerCarGame from "../app/components/ToddlerCarGame";
import { BUILD_NAME_PROMPT, NAME_GAME_ANALYTICS } from "../app/lib/huntrix";

const speech = vi.hoisted(() => ({ speak: vi.fn(), stop: vi.fn() }));
const analytics = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("../app/lib/speech", () => ({ speakRussian: speech.speak, stopSpeaking: speech.stop, preloadVoices: vi.fn() }));
vi.mock("../app/lib/analytics", () => ({ track: analytics.track, analyticsContext: () => ({ profile: "mira" }) }));

const repeats = () => analytics.track.mock.calls.filter(call => call[0] === "game_instruction_repeated").map(call => call[1]);
const click = (element: HTMLElement) => act(() => { fireEvent.click(element); });

beforeEach(() => {
  vi.useFakeTimers();
  speech.speak.mockReset();
  speech.stop.mockReset();
  analytics.track.mockReset();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("game_instruction_repeated", () => {
  it("stays silent while a game only speaks its opening prompt", () => {
    render(<LearningGame type="letters" soundEnabled onComplete={vi.fn()} />);
    render(<CarGarageGame soundEnabled onSolved={vi.fn()} onComplete={vi.fn()} />);
    render(<HuntrixSyllablesGame soundEnabled onComplete={vi.fn()} />);
    render(<ToddlerCarGame type="car-voices" soundEnabled onSolved={vi.fn()} onComplete={vi.fn()} />);

    expect(speech.speak).toHaveBeenCalled();
    expect(repeats()).toEqual([]);
  });

  it("sends exactly one voice event per tap in the learning games", () => {
    render(<LearningGame type="letters" soundEnabled onComplete={vi.fn()} />);
    click(screen.getByTestId("repeat-prompt"));

    expect(repeats()).toEqual([{ game: "letters", repeat_mode: "voice", attempts_before_repeat: 0 }]);
  });

  it("counts the attempts a child made before asking again", () => {
    render(<LearningGame type="letters" soundEnabled onComplete={vi.fn()} />);
    const wrong = screen.getAllByTestId(/^game-choice-/).find(button => button.dataset.answer === "wrong")!;
    click(wrong);
    act(() => { vi.advanceTimersByTime(800); });
    click(screen.getByTestId("repeat-prompt"));

    expect(repeats()).toEqual([{ game: "letters", repeat_mode: "voice", attempts_before_repeat: 1 }]);
  });

  it("reports the car garage repeat as voice", () => {
    render(<CarGarageGame soundEnabled onSolved={vi.fn()} onComplete={vi.fn()} />);
    click(screen.getByLabelText("Повторить задание голосом"));

    expect(repeats()).toEqual([{ game: "cars", repeat_mode: "voice", attempts_before_repeat: 0 }]);
  });

  it("marks the hiding game's replay as visual and the spoken games as voice", () => {
    render(<ToddlerCarGame type="car-hide" soundEnabled onSolved={vi.fn()} onComplete={vi.fn()} />);
    click(screen.getByLabelText("Показать ещё раз"));
    expect(repeats()).toEqual([{ game: "car-hide", repeat_mode: "visual", attempts_before_repeat: 0, game_variant: "hide-three-garages-v2", launch_date: "2026-10-02" }]);

    cleanup();
    analytics.track.mockReset();
    render(<ToddlerCarGame type="car-workshop" soundEnabled onSolved={vi.fn()} onComplete={vi.fn()} />);
    click(screen.getByLabelText("Повторить задание голосом"));
    expect(repeats()).toEqual([{ game: "car-workshop", repeat_mode: "voice", attempts_before_repeat: 0 }]);
  });

  it("keeps the syllable variant stamp on the repeat", () => {
    render(<HuntrixSyllablesGame soundEnabled onComplete={vi.fn()} />);
    speech.speak.mockClear();
    click(screen.getByLabelText("Повторить задание"));

    expect(repeats()).toEqual([{
      game: "huntrix-syllables", repeat_mode: "voice", attempts_before_repeat: 0,
      ...NAME_GAME_ANALYTICS,
    }]);
    const spoken = speech.speak.mock.calls.map(call => String(call[0]));
    expect(spoken).toHaveLength(1);
    expect(spoken).toEqual([BUILD_NAME_PROMPT]);
  });

  it("carries no child input beyond the game, the repeat mode and the attempt count", () => {
    render(<LearningGame type="colors" soundEnabled onComplete={vi.fn()} />);
    click(screen.getByTestId("repeat-prompt"));

    for (const properties of repeats()) {
      expect(Object.keys(properties).sort()).toEqual(["attempts_before_repeat", "game", "repeat_mode"]);
    }
  });
});
