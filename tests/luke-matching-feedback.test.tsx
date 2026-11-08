// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import LukeTapGame from "../app/components/LukeTapGame";
import { MATCH_PICTURES } from "../app/lib/luke-pictures";
import { SAME_PROMPT } from "../app/lib/luke-tap-games";

const speech = vi.hoisted(() => ({ speak: vi.fn(), stop: vi.fn() }));
vi.mock("../app/lib/speech", () => ({ speakRussian: speech.speak, stopSpeaking: speech.stop, preloadVoices: vi.fn() }));
vi.mock("../app/lib/analytics", () => ({ track: vi.fn(), analyticsContext: () => ({ profile: "luke" }) }));
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const item = () => MATCH_PICTURES.find(p => p.id === screen.getByTestId("toddler-sample").dataset.item)!;
const choose = (id: string) => fireEvent.click(screen.getByTestId(`toddler-choice-${id}`));

beforeEach(() => { vi.useFakeTimers(); speech.speak.mockReset(); speech.stop.mockReset(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

it("names the sample after nine seconds, allows retry and praises each of exactly two correct answers", () => {
  const solved = vi.fn(), complete = vi.fn();
  render(<LukeTapGame type="same-car" soundEnabled onSolved={solved} onComplete={complete} />);
  const first = item();
  expect(speech.speak).toHaveBeenLastCalledWith(SAME_PROMPT, true);
  advance(8999);
  expect(speech.speak).toHaveBeenCalledTimes(1);
  advance(1);
  expect(speech.speak).toHaveBeenLastCalledWith(first.hint, true);
  expect(screen.getByRole("heading").textContent).toBe(first.hint);
  const wrong = screen.getAllByTestId(/^toddler-choice-/).find(button => button.dataset.testid !== `toddler-choice-${first.id}`)!;
  fireEvent.click(wrong);
  fireEvent.click(wrong);
  expect(speech.speak.mock.calls.filter(([text]) => text === first.hint)).toHaveLength(3);
  choose(first.id);
  expect(speech.speak).toHaveBeenLastCalledWith(first.praise, true);
  expect(screen.getByRole("heading").textContent).toBe(first.praise);
  expect(solved).not.toHaveBeenCalled();
  advance(8000);
  const second = item();
  expect(second.id).not.toBe(first.id);
  expect(speech.speak).toHaveBeenLastCalledWith(SAME_PROMPT, true);
  choose(second.id);
  expect(speech.speak).toHaveBeenLastCalledWith(second.praise, true);
  expect(screen.getByRole("heading").textContent).toBe(second.praise);
  expect(solved).toHaveBeenCalledTimes(1);
  advance(8000);
  expect(complete).toHaveBeenCalledTimes(1);
  expect(speech.speak.mock.calls.filter(([text]) => text === second.hint)).toHaveLength(0);
});

it("gives a named hint immediately after a mistake, and cancels its idle timer on close", () => {
  const view = render(<LukeTapGame type="same-car" soundEnabled onSolved={vi.fn()} onComplete={vi.fn()} />);
  const target = item();
  const wrong = screen.getAllByTestId(/^toddler-choice-/).find(button => button.dataset.testid !== `toddler-choice-${target.id}`)!;
  fireEvent.click(wrong);
  expect(speech.speak).toHaveBeenLastCalledWith(target.hint, true);
  view.unmount();
  const calls = speech.speak.mock.calls.length;
  advance(10000);
  expect(speech.speak).toHaveBeenCalledTimes(calls);
});

it("keeps the named visual hint and praise when sound is disabled", () => {
  render(<LukeTapGame type="same-car" soundEnabled={false} onSolved={vi.fn()} onComplete={vi.fn()} />);
  const target = item();
  advance(9000);
  expect(speech.speak).toHaveBeenLastCalledWith(target.hint, false);
  expect(screen.getByRole("heading").textContent).toBe(target.hint);
  choose(target.id);
  expect(speech.speak).toHaveBeenLastCalledWith(target.praise, false);
});
