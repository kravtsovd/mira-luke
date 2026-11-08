// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import KidsTubeApp from "../app/components/KidsTubeApp";
import { PROFILES_STORAGE_KEY, restoreProfiles } from "../app/lib/profiles";
import { VIDEOS } from "../app/data/catalog";

const player = vi.hoisted(() => ({ pause: vi.fn(), play: vi.fn(), onPlaying: (_: boolean) => {} }));
const navigation = vi.hoisted(() => ({ query: "" }));
vi.mock("../app/components/useAccount", () => ({ default: () => ({ loaded: true, error: false, signOut: vi.fn(), account: { signedIn: true, family: { id: "demo", name: "" }, googleConfigured: true } }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => new URLSearchParams(navigation.query) }));
vi.mock("../app/components/useNativeRecommendations", () => ({ default: () => [] }));
vi.mock("../app/lib/speech", () => ({ speakRussian: vi.fn(), stopSpeaking: vi.fn(), preloadVoices: vi.fn() }));
vi.mock("../app/components/YouTubePlayer", () => ({ default: ({ onPlayerReady, onPlayingChange }: { onPlayerReady: (value: unknown) => void; onPlayingChange: (playing: boolean) => void }) => {
  React.useEffect(() => {
    player.onPlaying = onPlayingChange;
    onPlayerReady({ pauseVideo: player.pause, playVideo: player.play });
  }, [onPlayerReady, onPlayingChange]);
  return null;
} }));
vi.mock("../app/components/KidsCatalog", () => ({ default: () => null }));

beforeEach(() => {
  vi.useFakeTimers();
  player.pause.mockReset();
  player.play.mockReset();
  navigation.query = "";
  vi.stubGlobal("fetch", vi.fn((url: string, options?: RequestInit) => {
    if (url !== "/api/profile-settings") return new Promise(() => {});
    if (options?.method === "PUT") {
      const body = JSON.parse(options.body as string);
      return Promise.resolve(Response.json({ saved: { ...body, revision: body.revision + 1 } }));
    }
    const store = restoreProfiles(JSON.parse(localStorage.getItem(PROFILES_STORAGE_KEY)!));
    return Promise.resolve(Response.json({ profiles: ["mira", "luke"].map(profile => ({ profile, revision: 1, settings: store.settings[profile as "mira" | "luke"] })) }));
  }));
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  const profiles = restoreProfiles(null);
  profiles.activeProfile = "luke";
  // These playback checks hold the prior single-game preset fixed.
  profiles.settings.luke.enabledGames = ["cars"];
  localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles));
});
afterEach(() => { cleanup(); localStorage.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const advance = (seconds: number) => act(() => { vi.advanceTimersByTime(seconds * 1000); });
const playing = (value: boolean) => act(() => { player.onPlaying(value); });

it("waits for 300 playing seconds, excludes paused time, and resumes only after all three cars", () => {
  render(<KidsTubeApp />);
  advance(600);
  expect(screen.queryByTestId("car-game")).toBeNull();
  playing(true);
  advance(180);
  playing(false);
  advance(600);
  expect(screen.queryByTestId("car-game")).toBeNull();
  playing(true);
  advance(119);
  expect(screen.queryByTestId("car-game")).toBeNull();
  advance(1);
  expect(screen.queryByTestId("car-game")).not.toBeNull();
  expect(player.pause).toHaveBeenCalledTimes(1);
  // Two of the three colours wait on the road each game; the third garage is a distractor.
  const cars = screen.getAllByTestId(/^car-(red|yellow|green)$/).map(car => car.getAttribute("data-testid")!.slice(4));
  expect(cars).toHaveLength(2);
  const wrongGarage = ["red", "yellow", "green"].find(color => !cars.includes(color))!;
  fireEvent.click(screen.getByTestId(`car-${cars[0]}`));
  fireEvent.click(screen.getByTestId(`garage-${wrongGarage}`));
  expect(player.play).not.toHaveBeenCalled();
  for (const color of cars) {
    fireEvent.click(screen.getByTestId(`car-${color}`));
    fireEvent.click(screen.getByTestId(`garage-${color}`));
  }
  expect(player.play).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "Продолжить мультик" })).toBeNull();
  advance(0.9);
  expect(screen.queryByTestId("car-game")).not.toBeNull();
  advance(0.7);
  expect(screen.queryByTestId("car-game")).toBeNull();
  expect(player.play).toHaveBeenCalledTimes(1);
  playing(true);
  advance(299);
  expect(screen.queryByTestId("car-game")).toBeNull();
  advance(1);
  expect(screen.queryByTestId("car-game")).not.toBeNull();
});

it("keeps Luke's remaining time across profile switches without giving Mira car breaks", () => {
  render(<KidsTubeApp />);
  playing(true);
  advance(200);
  fireEvent.click(screen.getByTestId("profile-mira"));
  playing(true);
  advance(600);
  expect(screen.queryByTestId("car-game")).toBeNull();
  fireEvent.click(screen.getByTestId("profile-luke"));
  playing(true);
  advance(99);
  expect(screen.queryByTestId("car-game")).toBeNull();
  advance(1);
  expect(screen.queryByTestId("car-game")).not.toBeNull();
});

it("accumulates watching across different videos instead of restarting the five-minute wait", () => {
  const view = render(<KidsTubeApp />);
  playing(true);
  advance(120);
  navigation.query = `video=${VIDEOS[1].id}`;
  view.rerender(<KidsTubeApp />);
  playing(true);
  advance(179);
  expect(screen.queryByTestId("car-game")).toBeNull();
  advance(1);
  expect(screen.queryByTestId("car-game")).not.toBeNull();
});

it("keeps a manually opened game when the home catalog finishes loading", async () => {
  let finishCatalog!: (response: Response) => void;
  const originalFetch = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation((...args) => args[0] === "/api/catalog" ? new Promise(resolve => { finishCatalog = resolve; }) : originalFetch(...args));
  render(<KidsTubeApp />);
  fireEvent.click(screen.getByTestId("quick-games"));
  const first = screen.getAllByTestId(/^car-(red|yellow|green)$/)[0].getAttribute("data-testid")!.slice(4);
  fireEvent.click(screen.getByTestId(`car-${first}`));
  fireEvent.click(screen.getByTestId(`garage-${first}`));
  await act(async () => {
    finishCatalog(new Response(JSON.stringify({ source: "database", items: [...VIDEOS].reverse() })));
  });
  expect(screen.queryByTestId("car-game")).not.toBeNull();
  expect(screen.getByTestId(`garage-${first}`).getAttribute("data-parked")).toBe("true");
});

it("saves a three-second test interval for Luke without changing Mira's default", async () => {
  await act(async () => { render(<KidsTubeApp />); });
  fireEvent.click(screen.getByTestId("settings-open"));
  fireEvent.click(screen.getByTestId("interval-test-3-seconds"));
  await act(async () => { fireEvent.click(screen.getByTestId("save-settings")); });
  const saved = restoreProfiles(JSON.parse(localStorage.getItem(PROFILES_STORAGE_KEY)!));
  expect(saved.settings.luke.intervalMinutes * 60).toBe(3);
  expect(saved.settings.mira.intervalMinutes).toBe(10);
  playing(true);
  advance(2);
  expect(screen.queryByTestId("car-game")).toBeNull();
  advance(1);
  expect(screen.queryByTestId("car-game")).not.toBeNull();
});

it("ignores playback callbacks from the previous child's player", () => {
  render(<KidsTubeApp />);
  const oldPlayback = player.onPlaying;
  fireEvent.click(screen.getByTestId("profile-mira"));
  act(() => oldPlayback(true));
  advance(600);
  expect(screen.queryByTestId("huntrix-game")).toBeNull();
  expect(screen.queryByTestId("car-game")).toBeNull();
  expect(screen.queryByTestId("game-dialog")).toBeNull();
});

it("offers only enabled Luke games and never injects disabled toddler games", async () => {
  const profiles = restoreProfiles(null);
  profiles.activeProfile = "luke";
  profiles.settings.luke.enabledGames = ["cars", "car-voices"];
  localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles));
  await act(async () => { render(<KidsTubeApp />); });
  fireEvent.click(screen.getByTestId("quick-games"));
  expect(screen.getByTestId("quick-game-cars")).toBeTruthy();
  expect(screen.getByTestId("quick-game-car-voices")).toBeTruthy();
  for (const game of ["huntrix", "car-workshop", "car-hide", "syllables", "words"]) {
    expect(screen.queryByTestId(`quick-game-${game}`)).toBeNull();
  }
});

it("resumes the cartoon after a game opened from a stopped player", async () => {
  await act(async () => { render(<KidsTubeApp />); });
  fireEvent.click(screen.getByTestId("quick-games"));
  const cars = screen.getAllByTestId(/^car-(red|yellow|green)$/).map(car => car.getAttribute("data-testid")!.slice(4));
  for (const color of cars) {
    fireEvent.click(screen.getByTestId(`car-${color}`));
    fireEvent.click(screen.getByTestId(`garage-${color}`));
  }
  expect(player.play).toHaveBeenCalledOnce();
  advance(2);
  expect(screen.queryByTestId("car-game")).toBeNull();
  expect(player.play).toHaveBeenCalledOnce();
});
