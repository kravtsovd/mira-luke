// @vitest-environment jsdom

import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import YouTubePlayer, { YouTubePlayerHandle } from "../app/components/YouTubePlayer";
import { track } from "../app/lib/analytics";

vi.mock("../app/lib/analytics", () => ({ track: vi.fn() }));

type PlayerOptions = {
  videoId: string;
  playerVars: Record<string, number | string>;
  events: {
    onReady: (event: { target: FakePlayer }) => void;
    onStateChange: (event: { data: number }) => void;
    onError: (event: { data: number }) => void;
    onAutoplayBlocked: () => void;
  };
};

class FakePlayer {
  pauseVideo = vi.fn();
  playVideo = vi.fn();
  destroy = vi.fn();
  getCurrentTime = vi.fn(() => 12);
  getDuration = vi.fn(() => 120);
  getPlayerState = vi.fn(() => 5);
  getVideoLoadedFraction = vi.fn(() => 1);
  seekTo = vi.fn();
  loadVideoById = vi.fn();
}

const created: Array<{ options: PlayerOptions; player: FakePlayer }> = [];

function renderPlayer(props: { initialMenu?: boolean; autoPlay?: boolean; videoId?: string } = {}) {
  let handle: YouTubePlayerHandle | null = null;
  const playingChanges: boolean[] = [];
  const onPlayingChange = (playing: boolean) => playingChanges.push(playing);
  const onPlayerReady = (nextHandle: YouTubePlayerHandle | null) => { handle = nextHandle; };
  const renderPauseMenu = (ended: boolean, resume: () => void) => (
    <button type="button" onClick={resume}>{ended ? "Replay" : "Resume"}</button>
  );
  const component = (nextProps = props) => (
    <YouTubePlayer
      videoId={nextProps.videoId ?? "first-video"}
      title="First video"
      initialMenu={nextProps.initialMenu}
      autoPlay={nextProps.autoPlay}
      onPlayingChange={onPlayingChange}
      onPlayerReady={onPlayerReady}
      renderPauseMenu={renderPauseMenu}
    />
  );
  const result = render(component());
  return {
    getHandle: () => handle,
    playingChanges,
    rerender: (nextProps: typeof props) => result.rerender(component(nextProps)),
  };
}

beforeEach(() => {
  vi.mocked(track).mockClear();
  created.length = 0;
  Object.defineProperty(window, "YT", {
    configurable: true,
    value: {
      Player: class {
        constructor(_element: HTMLElement, options: PlayerOptions) {
          const player = new FakePlayer();
          created.push({ options, player });
          return player;
        }
      },
      PlayerState: { PLAYING: 1 },
    },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("YouTubePlayer playback commands", () => {
  it("reports actual playback, buffering, errors and retry for the selected video", async () => {
    const view = renderPlayer();
    await waitFor(() => expect(created).toHaveLength(1));
    const current = created[0];
    act(() => current.options.events.onReady({ target: current.player }));
    act(() => view.getHandle()?.loadVideo("selected-video"));
    act(() => current.options.events.onStateChange({ data: 1 }));
    act(() => current.options.events.onStateChange({ data: 3 }));
    act(() => current.options.events.onError({ data: 150 }));
    fireEvent.click(screen.getByRole("button", { name: "Попробовать снова" }));
    expect(track).toHaveBeenCalledWith("video_started", expect.objectContaining({ video_id: "selected-video" }));
    expect(track).toHaveBeenCalledWith("video_buffering", expect.objectContaining({ video_id: "selected-video" }));
    expect(track).toHaveBeenCalledWith("video_error", { video_id: "selected-video", error_code: 150 });
    expect(track).toHaveBeenCalledWith("video_retry_clicked", { video_id: "selected-video", error_code: 150 });
  });
  it("does not issue any retries or accept late events after unmount during startup", async () => {
    const view = renderPlayer();
    await waitFor(() => expect(created).toHaveLength(1));
    const current = created[0];
    act(() => current.options.events.onReady({ target: current.player }));
    vi.useFakeTimers();
    act(() => view.getHandle()?.loadVideo("pending-video"));
    cleanup();
    const attempts = current.player.playVideo.mock.calls.length;
    act(() => vi.advanceTimersByTime(15000));
    act(() => current.options.events.onStateChange({ data: 5 }));
    expect(current.player.playVideo).toHaveBeenCalledTimes(attempts);
    expect(current.player.destroy).toHaveBeenCalledOnce();
  });

  it("cancels a readiness poll when the user opens the menu", async () => {
    const view = renderPlayer();
    await waitFor(() => expect(created).toHaveLength(1));
    const current = created[0];
    current.player.getDuration.mockReturnValue(0);
    current.player.getVideoLoadedFraction.mockReturnValue(0);
    current.player.getPlayerState.mockReturnValue(-1);
    vi.useFakeTimers();
    act(() => current.options.events.onReady({ target: current.player }));
    act(() => view.getHandle()?.pauseVideo());
    current.player.getDuration.mockReturnValue(120);
    act(() => vi.advanceTimersByTime(15000));
    expect(screen.getByRole("button", { name: "Resume" })).toBeTruthy();
    expect(current.player.playVideo).not.toHaveBeenCalled();
  });

  it("stops retrying when the browser explicitly blocks autoplay and explains the required gesture", async () => {
    const view = renderPlayer();
    await waitFor(() => expect(created).toHaveLength(1));
    const current = created[0];
    act(() => current.options.events.onReady({ target: current.player }));
    vi.useFakeTimers();
    act(() => view.getHandle()?.loadVideo("second-video"));
    act(() => current.options.events.onAutoplayBlocked());
    const attempts = current.player.playVideo.mock.calls.length;
    act(() => vi.advanceTimersByTime(15000));
    expect(current.player.playVideo).toHaveBeenCalledTimes(attempts);
    expect(screen.getByRole("status").textContent).toContain("Браузер просит");
    expect(view.playingChanges.at(-1)).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Включить мультик" }));
    act(() => current.options.events.onStateChange({ data: 1 }));
    expect(view.playingChanges.at(-1)).toBe(true);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("bounds a silent failed start and cancels the old intent before a later CUED event", async () => {
    const view = renderPlayer();
    await waitFor(() => expect(created).toHaveLength(1));
    const current = created[0];
    act(() => current.options.events.onReady({ target: current.player }));
    vi.useFakeTimers();
    act(() => view.getHandle()?.loadVideo("silent-video"));
    act(() => vi.advanceTimersByTime(10000));
    const attempts = current.player.playVideo.mock.calls.length;
    act(() => current.options.events.onStateChange({ data: 5 }));
    act(() => vi.advanceTimersByTime(60000));
    expect(current.player.playVideo).toHaveBeenCalledTimes(attempts);
    expect(screen.getByRole("status").textContent).toContain("ещё не запустилось");
  });

  it("honors pause before readiness and ignores delayed events from a destroyed player", async () => {
    const view = renderPlayer({ initialMenu: true });
    await waitFor(() => expect(created).toHaveLength(1));
    const current = created[0];
    act(() => view.getHandle()?.loadVideo("selected-video"));
    act(() => view.getHandle()?.pauseVideo());
    act(() => current.options.events.onReady({ target: current.player }));
    expect(current.player.playVideo).not.toHaveBeenCalled();
    act(() => view.getHandle()?.playVideo());
    expect(current.player.loadVideoById).toHaveBeenLastCalledWith("selected-video");
    act(() => current.options.events.onError({ data: 150 }));
    act(() => view.getHandle()?.loadVideo("new-video"));
    await waitFor(() => expect(created).toHaveLength(2));
    act(() => current.options.events.onStateChange({ data: 1 }));
    act(() => current.options.events.onAutoplayBlocked());
    expect(view.playingChanges.at(-1)).toBe(false);
    expect(screen.queryByText("Браузер просит нажать на видео для запуска")).toBeNull();
  });

  it("returns to the home menu on browser back after a successful selection", async () => {
    const view = renderPlayer({ initialMenu: true });
    await waitFor(() => expect(created).toHaveLength(1));
    const current = created[0];
    act(() => current.options.events.onReady({ target: current.player }));
    act(() => view.getHandle()?.loadVideo("second-video"));
    view.rerender({ initialMenu: false, videoId: "second-video" });
    act(() => current.options.events.onStateChange({ data: 1 }));
    view.rerender({ initialMenu: true });
    expect(screen.getByTestId("youtube-player").hidden).toBe(true);
    expect(current.player.pauseVideo).toHaveBeenCalled();
    expect(view.playingChanges.at(-1)).toBe(false);
    expect(current.player.loadVideoById).toHaveBeenLastCalledWith("second-video");
  });

  it("keeps only the latest selection and resume intent while the API is still loading", async () => {
    const view = renderPlayer({ initialMenu: true });
    await waitFor(() => expect(created).toHaveLength(1));
    const current = created[0];
    act(() => view.getHandle()?.loadVideo("older-video"));
    act(() => view.getHandle()?.loadVideo("latest-video"));
    act(() => view.getHandle()?.pauseVideo());
    act(() => view.getHandle()?.playVideo());
    act(() => current.options.events.onReady({ target: current.player }));
    expect(current.player.loadVideoById).toHaveBeenCalledExactlyOnceWith("latest-video");
    expect(current.player.playVideo).toHaveBeenCalledTimes(1);
    expect(created).toHaveLength(1);
  });

  it("reveals the home iframe inside the selection before sending playback commands", async () => {
    const view = renderPlayer({ initialMenu: true });
    await waitFor(() => expect(created).toHaveLength(1));
    const current = created[0];
    act(() => current.options.events.onReady({ target: current.player }));
    current.player.loadVideoById.mockImplementation(() => {
      expect(screen.getByTestId("youtube-player").hidden).toBe(false);
      expect(screen.getByTestId("youtube-player").hasAttribute("inert")).toBe(false);
    });
    act(() => view.getHandle()?.loadVideo("second-video"));
    expect(current.player.loadVideoById).toHaveBeenCalledWith("second-video");
  });

  it.each([false, true])("starts a slow selection after 1500ms without a second tap (CUED event: %s)", async (emitCued) => {
    const view = renderPlayer();
    await waitFor(() => expect(created).toHaveLength(1));
    const current = created[0];
    act(() => current.options.events.onReady({ target: current.player }));
    vi.useFakeTimers();
    let playable = false;
    current.player.playVideo.mockImplementation(() => {
      if (playable) current.options.events.onStateChange({ data: 1 });
    });
    act(() => view.getHandle()?.loadVideo("slow-video"));
    act(() => vi.advanceTimersByTime(1500));
    expect(view.playingChanges.at(-1)).toBe(false);
    playable = true;
    if (emitCued) act(() => current.options.events.onStateChange({ data: 5 }));
    act(() => vi.advanceTimersByTime(1000));
    expect(view.playingChanges.at(-1)).toBe(true);
    expect(current.player.loadVideoById).toHaveBeenCalledTimes(1);
    expect(created).toHaveLength(1);
  });

  it("keeps a stopped-picture play request through YouTube's cued state", async () => {
    renderPlayer();
    await waitFor(() => expect(created).toHaveLength(1));
    const current = created[0];
    act(() => current.options.events.onReady({ target: current.player }));

    fireEvent.click(screen.getByRole("button", { name: "Включить мультик" }));
    expect(current.player.loadVideoById).toHaveBeenCalledWith("first-video");
    expect(current.player.playVideo).toHaveBeenCalledTimes(1);
    act(() => current.options.events.onStateChange({ data: 5 }));
    expect(current.player.playVideo).toHaveBeenCalledTimes(2);

    act(() => current.options.events.onStateChange({ data: 1 }));
    expect(screen.getByRole("button", { name: "Поставить на паузу" })).toBeTruthy();
  });

  it("retries a stopped-picture play when YouTube emits no readiness state", async () => {
    renderPlayer();
    await waitFor(() => expect(created).toHaveLength(1));
    const current = created[0];
    act(() => current.options.events.onReady({ target: current.player }));
    vi.useFakeTimers();

    fireEvent.click(screen.getByRole("button", { name: "Включить мультик" }));
    expect(current.player.playVideo).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(750));
    expect(current.player.playVideo).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("waits beyond one second for actual media readiness before exposing play", async () => {
    renderPlayer();
    await waitFor(() => expect(created).toHaveLength(1));
    const current = created[0];
    current.player.getDuration.mockReturnValue(0);
    current.player.getPlayerState.mockReturnValue(-1);
    current.player.getVideoLoadedFraction.mockReturnValue(0);
    vi.useFakeTimers();

    act(() => current.options.events.onReady({ target: current.player }));
    act(() => vi.advanceTimersByTime(1500));
    expect(screen.queryByRole("button", { name: "Включить мультик" })).toBeNull();

    current.player.getDuration.mockReturnValue(120);
    act(() => vi.advanceTimersByTime(100));
    expect(screen.getByRole("button", { name: "Включить мультик" })).toBeTruthy();
    vi.useRealTimers();
  });

  it("cancels pending play retries on pause, end, error, and unmount", async () => {
    const view = renderPlayer();
    await waitFor(() => expect(created).toHaveLength(1));
    const current = created[0];
    act(() => current.options.events.onReady({ target: current.player }));
    vi.useFakeTimers();

    fireEvent.click(screen.getByRole("button", { name: "Включить мультик" }));
    expect(current.player.playVideo).toHaveBeenCalledTimes(1);
    act(() => view.getHandle()?.pauseVideo());
    act(() => vi.advanceTimersByTime(15000));
    expect(current.player.playVideo).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    act(() => current.options.events.onStateChange({ data: 0 }));
    const afterEnd = current.player.playVideo.mock.calls.length;
    act(() => vi.advanceTimersByTime(15000));
    expect(current.player.playVideo).toHaveBeenCalledTimes(afterEnd);

    fireEvent.click(screen.getByRole("button", { name: "Replay" }));
    act(() => current.options.events.onError({ data: 150 }));
    const afterError = current.player.playVideo.mock.calls.length;
    act(() => vi.advanceTimersByTime(15000));
    expect(current.player.playVideo).toHaveBeenCalledTimes(afterError);

    cleanup();
    act(() => vi.advanceTimersByTime(15000));
    expect(current.player.playVideo).toHaveBeenCalledTimes(afterError);
    vi.useRealTimers();
  });

  it("replaces pending retries with the newest selected source", async () => {
    const view = renderPlayer();
    await waitFor(() => expect(created).toHaveLength(1));
    const current = created[0];
    act(() => current.options.events.onReady({ target: current.player }));
    vi.useFakeTimers();

    fireEvent.click(screen.getByRole("button", { name: "Включить мультик" }));
    act(() => view.getHandle()?.loadVideo("newest-video"));
    act(() => vi.advanceTimersByTime(750));
    expect(current.player.loadVideoById).toHaveBeenLastCalledWith("newest-video");
    // Initial tap + new-source immediate play + only the newest source's two retries.
    expect(current.player.playVideo).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });

  it("keeps a first-tap selection while the player is not ready, then pauses and resumes on one tap", async () => {
    const view = renderPlayer({ initialMenu: true });
    await waitFor(() => expect(created).toHaveLength(1));
    const first = created[0];
    const handle = view.getHandle();
    expect(handle).not.toBeNull();

    act(() => {
      expect(handle?.loadVideo("second-video")).toBe(true);
    });
    view.rerender({ initialMenu: false, videoId: "second-video" });
    expect(first.player.loadVideoById).not.toHaveBeenCalled();

    act(() => first.options.events.onReady({ target: first.player }));
    expect(first.player.loadVideoById).toHaveBeenCalledWith("second-video");
    expect(first.player.playVideo).toHaveBeenCalledTimes(1);

    act(() => first.options.events.onStateChange({ data: 1 }));
    fireEvent.click(screen.getByRole("button", { name: "Поставить на паузу" }));
    expect(first.player.pauseVideo).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Resume" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(first.player.playVideo).toHaveBeenCalledTimes(2);
    expect(created).toHaveLength(1);

    act(() => handle?.loadVideo("third-video"));
    expect(first.player.loadVideoById).toHaveBeenLastCalledWith("third-video");
    expect(created).toHaveLength(1);
  });

  it("recovers from a YouTube error by starting the next selection without a manual retry", async () => {
    const view = renderPlayer({ autoPlay: true });
    await waitFor(() => expect(created).toHaveLength(1));
    const failed = created[0];
    act(() => failed.options.events.onReady({ target: failed.player }));
    act(() => failed.options.events.onError({ data: 150 }));
    expect(screen.getByTestId("player-error").textContent).toContain("ошибку 150");

    act(() => {
      expect(view.getHandle()?.loadVideo("working-video")).toBe(true);
    });
    await waitFor(() => expect(created).toHaveLength(2));
    const recovered = created[1];
    expect(recovered.options.videoId).toBe("working-video");
    expect(recovered.options.playerVars.autoplay).toBe(1);

    act(() => recovered.options.events.onReady({ target: recovered.player }));
    expect(recovered.player.playVideo).toHaveBeenCalled();
    expect(screen.queryByTestId("player-error")).toBeNull();
  });

  it("restarts an ended video from zero with the same player", async () => {
    renderPlayer({ autoPlay: true });
    await waitFor(() => expect(created).toHaveLength(1));
    const current = created[0];
    act(() => current.options.events.onReady({ target: current.player }));
    act(() => current.options.events.onStateChange({ data: 1 }));
    act(() => current.options.events.onStateChange({ data: 0 }));

    fireEvent.click(screen.getByRole("button", { name: "Replay" }));
    expect(current.player.seekTo).toHaveBeenCalledWith(0, true);
    expect(current.player.playVideo).toHaveBeenCalledTimes(2);
    expect(created).toHaveLength(1);
  });
});

describe("YouTubePlayer scrubber", () => {
  async function readyPlayer() {
    const view = renderPlayer({ autoPlay: true });
    await waitFor(() => expect(created).toHaveLength(1));
    const current = created[0];
    vi.useFakeTimers();
    act(() => current.options.events.onReady({ target: current.player }));
    act(() => current.options.events.onStateChange({ data: 1 }));
    // Progress arrives with the one-second sampler, the same clock analytics reads.
    act(() => vi.advanceTimersByTime(1000));
    return { view, current };
  }

  it("shows the clock and duration, previews while dragging and commits the seek on release without pausing", async () => {
    const { view, current } = await readyPlayer();
    expect(screen.getByTestId("player-scrubber-current").textContent).toBe("0:12");
    expect(screen.getByTestId("player-scrubber-duration").textContent).toBe("2:00");
    const range = screen.getByTestId("player-scrubber-range") as HTMLInputElement;
    expect(range.max).toBe("120");
    fireEvent.change(range, { target: { value: "60" } });
    expect(current.player.seekTo).toHaveBeenLastCalledWith(60, false);
    expect(screen.getByTestId("player-scrubber-current").textContent).toBe("1:00");
    fireEvent.pointerUp(range);
    expect(current.player.seekTo).toHaveBeenLastCalledWith(60, true);
    expect(current.player.pauseVideo).not.toHaveBeenCalled();
    expect(view.playingChanges.at(-1)).toBe(true);
    expect(track).toHaveBeenCalledWith("video_seek", expect.objectContaining({ from_seconds: 12, to_seconds: 60 }));
  });

  it("stops one second before the end so a drag to the edge does not finish the video", async () => {
    const { current } = await readyPlayer();
    const range = screen.getByTestId("player-scrubber-range");
    fireEvent.change(range, { target: { value: "120" } });
    fireEvent.pointerUp(range);
    expect(current.player.seekTo).toHaveBeenLastCalledWith(119, true);
  });

  it("fades the scrubber three seconds into playback and wakes it from a touch at the bottom edge", async () => {
    const { current } = await readyPlayer();
    const scrubber = screen.getByTestId("player-scrubber");
    expect(scrubber.getAttribute("data-visible")).toBe("true");
    act(() => vi.advanceTimersByTime(3100));
    expect(scrubber.getAttribute("data-visible")).toBe("false");
    fireEvent.pointerDown(scrubber);
    expect(scrubber.getAttribute("data-visible")).toBe("true");
    act(() => vi.advanceTimersByTime(3100));
    expect(scrubber.getAttribute("data-visible")).toBe("false");
    // A stopped picture keeps the bar on screen: the child needs it to pick a place to start from.
    act(() => current.options.events.onStateChange({ data: 2 }));
    expect(screen.queryByTestId("player-scrubber")).toBeNull();
  });

  it("hides the scrubber while the pause menu is open and ignores seeks before readiness", async () => {
    const view = renderPlayer({ initialMenu: true });
    await waitFor(() => expect(created).toHaveLength(1));
    const current = created[0];
    expect(screen.queryByTestId("player-scrubber")).toBeNull();
    act(() => view.getHandle()?.seekTo(10));
    expect(current.player.seekTo).not.toHaveBeenCalled();
    vi.useFakeTimers();
    act(() => current.options.events.onReady({ target: current.player }));
    act(() => view.getHandle()?.playVideo());
    act(() => current.options.events.onStateChange({ data: 1 }));
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByTestId("player-scrubber")).toBeTruthy();
    act(() => view.getHandle()?.pauseVideo());
    expect(screen.queryByTestId("player-scrubber")).toBeNull();
  });
});
