// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ENGLISH_PROGRESS_KEY, freshProgress, readEnglishProgress } from "../app/lib/english-find";
import { loadSharedEnglishProgress, pendingEnglishRounds, queueEnglishRound } from "../app/lib/english-progress-sync";
import EnglishFindGame from "../app/components/EnglishFindGame";

vi.mock("../app/lib/speech", async (importOriginal) => ({ ...await importOriginal<typeof import("../app/lib/speech")>(), speakRussian: vi.fn(), stopSpeaking: vi.fn(), preloadVoices: vi.fn() }));
vi.mock("../app/lib/analytics", () => ({ track: vi.fn(), analyticsContext: () => ({ profile: "mira" }) }));

let server = freshProgress();
let online = true;
const posted: unknown[] = [];

beforeEach(() => {
  localStorage.clear();
  server = freshProgress();
  online = true;
  posted.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: string, options: RequestInit = {}) => {
    if (!online) throw new TypeError("offline");
    if (options.method === "POST") {
      const body = JSON.parse(options.body as string);
      posted.push(body.round);
      server = { ...server, rounds: server.rounds + 1 };
      return Response.json({ progress: server });
    }
    return Response.json({ progress: server });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it("keeps a round finished offline and sends it, once, when the network is back", async () => {
  online = false;
  expect(await queueEnglishRound({ id: "round-offline-1", level: 1, clean: true })).toBeNull();
  expect(pendingEnglishRounds()).toBe(1);
  expect(await loadSharedEnglishProgress()).toBeNull(); // the local view wins while a round is unsent
  online = true;
  const shared = await loadSharedEnglishProgress();
  expect(posted).toEqual([{ id: "round-offline-1", level: 1, clean: true }]);
  expect(pendingEnglishRounds()).toBe(0);
  expect(shared).toMatchObject({ rounds: 1 });
  expect(readEnglishProgress()).toMatchObject({ rounds: 1 });
});

it("opens at the level another device reached, and sends each finished round to the server", async () => {
  localStorage.setItem(ENGLISH_PROGRESS_KEY, JSON.stringify(freshProgress(1, 1)));
  server = { ...freshProgress(3, 2), rounds: 12, cleanRounds: 9 };
  render(<EnglishFindGame soundEnabled onSolved={vi.fn()} onComplete={vi.fn()} />);
  await waitFor(() => expect(screen.getByTestId("english-find-game").dataset.level).toBe("3"));
  expect(screen.getByTestId("english-stars").dataset.stars).toBe("2");

  vi.useFakeTimers();
  for (let index = 0; index < 3; index++) {
    act(() => { fireEvent.click(screen.getByTestId(`sticker-${screen.getByTestId("english-find-game").dataset.target}`)); });
    act(() => { vi.advanceTimersByTime(4000); });
  }
  vi.useRealTimers();
  await waitFor(() => expect(posted).toHaveLength(1));
  expect(posted[0]).toMatchObject({ level: 3, clean: true });
});

it("a test run never sends rounds to the server", async () => {
  vi.useFakeTimers();
  render(<EnglishFindGame soundEnabled onSolved={vi.fn()} onComplete={vi.fn()} practice={{ level: 2 }} />);
  for (let index = 0; index < 3; index++) {
    act(() => { fireEvent.click(screen.getByTestId(`sticker-${screen.getByTestId("english-find-game").dataset.target}`)); });
    act(() => { vi.advanceTimersByTime(4000); });
  }
  vi.useRealTimers();
  await Promise.resolve();
  expect(posted).toHaveLength(0);
  expect(pendingEnglishRounds()).toBe(0);
});
