// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { speakRussian, stopSpeaking } from "../app/lib/speech";

const synth = { cancel: vi.fn(), speak: vi.fn() };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("speechSynthesis", synth);
  vi.stubGlobal("SpeechSynthesisUtterance", class { lang = ""; rate = 1; constructor(public text: string) {} });
});
afterEach(() => vi.unstubAllGlobals());

it("selects Russian or English and cancels the previous instruction", () => {
  speakRussian("Найди машинку", true);
  expect(synth.speak).toHaveBeenLastCalledWith(expect.objectContaining({ text: "Найди машинку", lang: "ru-RU" }));
  speakRussian("Find the cat!", true);
  expect(synth.speak).toHaveBeenLastCalledWith(expect.objectContaining({ lang: "en-US" }));
  expect(synth.cancel).toHaveBeenCalledTimes(2);
});

it("mute and closing stop playback without starting a new utterance", () => {
  speakRussian("Молодец", false);
  stopSpeaking();
  expect(synth.speak).not.toHaveBeenCalled();
  expect(synth.cancel).toHaveBeenCalledTimes(2);
});

it("remains usable when device speech is unavailable", () => {
  vi.stubGlobal("speechSynthesis", undefined);
  // A browser may expose no speech API at all.
  Reflect.deleteProperty(window, "speechSynthesis");
  expect(() => speakRussian("Привет", true)).not.toThrow();
});
