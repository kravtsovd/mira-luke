"use client";

import React, { ReactNode, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { AlertTriangle, LoaderCircle, Play } from "lucide-react";
import { PlaybackAnalytics } from "../lib/playback-analytics";
import { track } from "../lib/analytics";

interface YouTubePlayerProps {
  videoId: string;
  title: string;
  onPlayingChange: (isPlaying: boolean) => void;
  onPlayerReady: (player: YouTubePlayerHandle | null) => void;
  renderPauseMenu: (ended: boolean, resume: () => void) => ReactNode;
  autoPlay?: boolean;
  initialMenu?: boolean;
}

export interface YouTubePlayerHandle {
  pauseVideo: () => void;
  playVideo: () => void;
  loadVideo: (id: string, fromGesture?: boolean) => boolean;
  seekTo: (seconds: number, commit?: boolean) => void;
}

function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

interface EmbeddedPlayer {
  pauseVideo: () => void;
  playVideo: () => void;
  destroy: () => void;
  getCurrentTime: () => number;
  getDuration?: () => number;
  getPlayerState?: () => number;
  getVideoLoadedFraction?: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  loadVideoById: (id: string) => void;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement,
        options: {
          videoId: string;
          playerVars: Record<string, number | string>;
          events: {
            onReady: (event: { target: EmbeddedPlayer }) => void;
            onStateChange: (event: { data: number }) => void;
            onError: (event: { data: number }) => void;
            onAutoplayBlocked: () => void;
          };
        },
      ) => EmbeddedPlayer;
      PlayerState: {
        PLAYING: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) {
    return Promise.resolve();
  }

  if (youtubeApiPromise) {
    return youtubeApiPromise;
  }

  youtubeApiPromise = new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      youtubeApiPromise = null;
      reject(new Error("YouTube API timeout"));
    }, 15000);

    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      window.clearTimeout(timeout);
      resolve();
    };

    if (!document.querySelector("script[data-youtube-iframe-api]")) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.dataset.youtubeIframeApi = "true";
      script.onerror = () => {
        window.clearTimeout(timeout);
        youtubeApiPromise = null;
        reject(new Error("YouTube API failed to load"));
      };
      document.head.appendChild(script);
    }
  });

  return youtubeApiPromise;
}

export default function YouTubePlayer({
  videoId,
  title,
  onPlayingChange,
  onPlayerReady,
  renderPauseMenu,
  autoPlay = false,
  initialMenu = false,
}: YouTubePlayerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const commandsRef = useRef<YouTubePlayerHandle | null>(null);
  const initialMenuRef = useRef(initialMenu);

  const videoIdRef = useRef(videoId);
  const autoPlayRef = useRef(autoPlay);
  const loadedIdRef = useRef<string | null>(null);
  videoIdRef.current = videoId;
  autoPlayRef.current = autoPlay;
  const [status, setStatus] = useState<"loading" | "ready" | "paused" | "ended" | "error">("loading");

  const [playing, setPlaying] = useState(false);
  const [errorCode, setErrorCode] = useState<number | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [playbackNotice, setPlaybackNotice] = useState<"blocked" | "timeout" | null>(null);
  // The tap layer covers YouTube's own progress bar, so the scrubber is ours. Progress comes from the same one-second sampler analytics uses.
  const [progress, setProgress] = useState({ current: 0, duration: 0 });
  const [scrubValue, setScrubValue] = useState<number | null>(null);
  // Like YouTube: the bar fades while the cartoon runs and comes back from a touch at the bottom edge, a hover, or a stop.
  const [scrubberAwake, setScrubberAwake] = useState(true);
  const scrubberSleepTimer = useRef<number | null>(null);
  const wakeScrubber = () => {
    setScrubberAwake(true);
    if (scrubberSleepTimer.current !== null) window.clearTimeout(scrubberSleepTimer.current);
    scrubberSleepTimer.current = window.setTimeout(() => { scrubberSleepTimer.current = null; setScrubberAwake(false); }, 3000);
  };
  useEffect(() => {
    if (!playing) {
      if (scrubberSleepTimer.current !== null) window.clearTimeout(scrubberSleepTimer.current);
      scrubberSleepTimer.current = null;
      setScrubberAwake(true);
      return;
    }
    wakeScrubber();
    return () => { if (scrubberSleepTimer.current !== null) window.clearTimeout(scrubberSleepTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  useEffect(() => {
    let cancelled = false;
    let generation = 0;
    let player: EmbeddedPlayer | null = null;
    let playerReady = false;
    let initializing = false;
    let pendingVideoId: string | null = null;
    let pendingPlay = false;
    let position = 0;
    let hasPlayed = false;
    let held = false;
    let restartOnResume = false;
    let resumePending = false;
    let playRetryCount = 0;
    let playRetryTimers: number[] = [];
    let readinessTimer: number | null = null;
    let playerReadyTimer: number | null = null;
    const analytics = new PlaybackAnalytics(videoIdRef.current);
    const samplePlayback = () => {
      try {
        const current = player?.getCurrentTime?.() ?? NaN;
        analytics.sample(current, document.visibilityState === "visible");
        const duration = player?.getDuration?.() ?? 0;
        if (Number.isFinite(current) && Number.isFinite(duration) && duration > 0) {
          setProgress((previous) => (previous.current === current && previous.duration === duration) ? previous : { current, duration });
        }
      }
      catch { /* The iframe can navigate between samples. */ }
    };
    const flushPlayback = () => { samplePlayback(); analytics.flush("page_hidden"); };
    const samplingTimer = window.setInterval(samplePlayback, 1000);
    window.addEventListener("pagehide", flushPlayback);
    document.addEventListener("visibilitychange", flushPlayback);
    const mount = mountRef.current;
    const report = (value: boolean) => {
      setPlaying(value);
      onPlayingChange(value);
    };

    const clearPlayRetries = () => {
      playRetryTimers.forEach((timer) => window.clearTimeout(timer));
      playRetryTimers = [];
    };

    const requestPlayback = (target: EmbeddedPlayer) => {
      analytics.request();
      resumePending = true;
      playRetryCount = 0;
      clearPlayRetries();
      if (readinessTimer !== null) window.clearTimeout(readinessTimer);
      setPlaybackNotice(null);

      playRetryTimers = [250, 750, 1500, 2500, 4000, 6000, 8000].map((delay) => window.setTimeout(() => {
        if (cancelled || held || !resumePending || !playerReady || player !== target) return;
        playRetryCount += 1;
        target.playVideo();
      }, delay));
      playRetryTimers.push(window.setTimeout(() => {
        if (cancelled || held || !resumePending || player !== target) return;
        resumePending = false;
        clearPlayRetries();
        analytics.event("video_start_timeout", { retry_count: playRetryCount, timeout_ms: 10000 });
        setPlaybackNotice("timeout");
      }, 10000));
      target.playVideo();
    };

    const revealWhenPlayable = (target: EmbeddedPlayer, token: number, attempt = 0) => {
      if (cancelled || token !== generation || held || player !== target) return;
      let playable = false;
      try {
        playable = (target.getDuration?.() ?? 0) > 0
          || (target.getVideoLoadedFraction?.() ?? 0) > 0
          || target.getPlayerState?.() === 5;
      } catch {
        // A navigation can briefly make the cross-origin player methods unavailable.
      }
      if (playable || attempt >= 100) {
        if (!playable) analytics.event("video_readiness_timeout", { timeout_ms: 10000 });
        readinessTimer = null;
        setStatus("ready");
        return;
      }
      readinessTimer = window.setTimeout(() => revealWhenPlayable(target, token, attempt + 1), 100);
    };

    const removePlayer = () => {
      generation += 1;
      const previous = player;
      player = null;
      playerReady = false;
      initializing = false;
      resumePending = false;
      clearPlayRetries();
      if (readinessTimer !== null) window.clearTimeout(readinessTimer);
      if (playerReadyTimer !== null) window.clearTimeout(playerReadyTimer);
      try {
        previous?.destroy();
      } catch {
        // The iframe may already be gone after browser navigation; detach the wrapper either way.
      } finally {
        mount?.replaceChildren();
      }
    };

    const hold = (ended = false) => {
      if (cancelled || held) return;
      samplePlayback();
      analytics.change(ended ? 0 : 2);
      const currentTime = player?.getCurrentTime?.();
      if (typeof currentTime === "number" && Number.isFinite(currentTime)) {
        position = Math.max(0, currentTime);
      }
      if (ended) position = 0;
      held = true;
      restartOnResume = ended;
      resumePending = false;
      pendingPlay = false;
      clearPlayRetries();
      if (readinessTimer !== null) window.clearTimeout(readinessTimer);
      setPlaybackNotice(null);
      player?.pauseVideo?.();
      report(false);
      setStatus(ended ? "ended" : "paused");
    };

    const initialize = async (resume = false) => {
      const token = ++generation;
      initializing = true;
      held = false;
      hasPlayed = false;
      setStatus("loading");
      setErrorCode(null);
      report(false);
      try {
        await loadYouTubeApi();
        if (cancelled || token !== generation || !mount || !window.YT?.Player) {
          return;
        }

        const playerTarget = document.createElement("div");
        mount.replaceChildren(playerTarget);
        // A selection made while recovery is starting must win over a render that still carries the previous prop.
        const startId = pendingVideoId ?? videoIdRef.current;
        const shouldPlayOnReady = resume || pendingPlay || autoPlayRef.current;
        loadedIdRef.current = startId;
        playerReadyTimer = window.setTimeout(() => {
          if (!cancelled && token === generation && !playerReady) analytics.event("player_ready_timeout", { timeout_ms: 15000 });
        }, 15000);
        player = new window.YT.Player(playerTarget, {
          videoId: startId,
          playerVars: {
            autoplay: shouldPlayOnReady ? 1 : 0,
            start: Math.floor(position),
            // One progress bar only: ours. YouTube's own chrome (bar, title, "Watch on YouTube", "More videos") would also surface every time a seek lands, and it is unreachable under the tap layer anyway. Captions stay on, since the chrome's CC toggle goes with it.
            controls: 0,
            cc_load_policy: 1,
            enablejsapi: 1,

            fs: 0,
            iv_load_policy: 3,
            playsinline: 1,
            rel: 0,
            hl: "en",
            cc_lang_pref: "en",
            origin: window.location.origin,
          },
          events: {
            onReady: ({ target }) => {
              if (cancelled || token !== generation) return;
              if (playerReadyTimer !== null) window.clearTimeout(playerReadyTimer);
              analytics.event("player_ready");
              player = target;
              playerReady = true;
              initializing = false;
              if (held) { target.pauseVideo(); return; }
              const requestedId = pendingVideoId;
              const shouldPlay = resume || pendingPlay || autoPlayRef.current;
              pendingVideoId = null;
              pendingPlay = false;
              if (requestedId && requestedId !== startId) {
                loadedIdRef.current = requestedId;
                target.loadVideoById(requestedId);
              }
              if (initialMenuRef.current && !shouldPlay) {
                initialMenuRef.current = false;
                hold();
                return;
              }
              if (shouldPlay) {
                setStatus("ready");
                if (position > 0) target.seekTo(position, true);
                requestPlayback(target);
              } else {
                // YT onReady means the API object exists, not that the inner media
                // can honor playVideo yet. Expose the stopped-picture tap only after
                // the player reports duration, buffered media, or CUED state.
                revealWhenPlayable(target, token);
              }
            },
            onStateChange: ({ data }) => {
              if (cancelled || token !== generation) return;
              if (held) {
                if (data === 1) player?.pauseVideo?.();
                return;
              }
              samplePlayback();
              analytics.change(data);
              if (data === 1) {
                hasPlayed = true;
                resumePending = false;
                clearPlayRetries();
                setPlaybackNotice(null);
                setStatus("ready");
              }
              if (data === 5 && !resumePending) {
                if (readinessTimer !== null) window.clearTimeout(readinessTimer);
                readinessTimer = null;
                setStatus("ready");
              }
              // The first user-initiated play can cue the media without starting it.
              // Retry that same explicit intent as soon as YouTube says it is playable,
              // so a stopped picture never needs a second tap.
              if (resumePending && (data === -1 || data === 2 || data === 5)) {
                report(false);
                if (playRetryCount < 12) {
                  playRetryCount += 1;
                  player?.playVideo?.();
                }
                return;
              }
              if (data === 0 || (data === 2 && hasPlayed && !resumePending)) {
                hold(data === 0);
                return;
              }
              report(data === window.YT?.PlayerState.PLAYING);
            },
            onError: ({ data }) => {
              if (cancelled || token !== generation) return;
              samplePlayback();
              analytics.event("video_error", { error_code: data });
              analytics.change(-1);
              removePlayer();
              setErrorCode(data);
              setStatus("error");
              report(false);
            },
            onAutoplayBlocked: () => {
              if (cancelled || token !== generation || held || !resumePending) return;
              analytics.event("video_autoplay_blocked");
              resumePending = false;
              clearPlayRetries();
              setPlaybackNotice("blocked");
              setStatus("ready");
              report(false);
            },
          },
        });
      } catch {
        if (!cancelled && token === generation) {
          analytics.event("player_initialization_failed");
          analytics.change(-1);
          initializing = false;
          removePlayer();
          setStatus("error");
        }
      }
    };

    const commands: YouTubePlayerHandle = {
      pauseVideo: () => hold(),
      playVideo: () => {
        const playbackWasPending = resumePending;
        initialMenuRef.current = false;
        flushSync(() => setStatus("ready"));
        resumePending = true;
        playRetryCount = 0;
        if (!playerReady || !player) {
          held = false;
          pendingPlay = true;
          if (!initializing) void initialize(true);
        } else if (held) {
          held = false;
          resumePending = true;

          flushSync(() => setStatus("ready"));
          if (pendingVideoId) {
            loadedIdRef.current = pendingVideoId;
            player.loadVideoById(pendingVideoId);
            pendingVideoId = null;
            pendingPlay = false;
          } else if (restartOnResume) player.seekTo(0, true);
          restartOnResume = false;
          requestPlayback(player);
        } else {
          // A never-started iframe may ignore playVideo while its inner media is
          // still unprimed. loadVideoById is the one command YouTube reliably
          // honors from this tap; it also starts the selected video immediately.
          if (!hasPlayed && !playbackWasPending) player.loadVideoById(loadedIdRef.current ?? videoIdRef.current);
          requestPlayback(player);
        }
      },
      // Dragging sends preview seeks (allowSeekAhead=false) so YouTube does not fetch every intermediate position; release commits. Clamp inside the media so a drag to the very end does not fire ENDED and drop the child into the menu.
      seekTo: (seconds, commit = true) => {
        if (!playerReady || !player || held) return;
        let current = 0;
        let duration = 0;
        try {
          current = player.getCurrentTime?.() ?? 0;
          duration = player.getDuration?.() ?? 0;
        } catch {
          return;
        }
        if (!Number.isFinite(current)) current = 0;
        const limit = Number.isFinite(duration) && duration > 0 ? Math.max(0, duration - 1) : Number.POSITIVE_INFINITY;
        const target = Math.min(limit, Math.max(0, seconds));
        if (commit) {
          position = target;
          samplePlayback();
          analytics.event("video_seek", { from_seconds: Math.round(current), to_seconds: Math.round(target) });
        }
        player.seekTo(target, commit);
        if (commit) setProgress((previous) => ({ current: target, duration: previous.duration || duration }));
      },

      loadVideo: (id, fromGesture = true) => {
        samplePlayback();
        setProgress({ current: 0, duration: 0 });
        analytics.select(id);
        videoIdRef.current = id;
        loadedIdRef.current = id;
        initialMenuRef.current = false;
        held = false;
        hasPlayed = false;
        restartOnResume = false;
        resumePending = true;
        playRetryCount = 0;
        position = 0;
        report(false);
        setPlaybackNotice(null);
        // The home prop changes only after history navigation. Reveal now, within the tap.
        const reveal = () => setStatus(playerReady ? "ready" : "loading");
        if (fromGesture) flushSync(reveal);
        else reveal();
        if (!playerReady || !player) {
          pendingVideoId = id;
          pendingPlay = true;
          if (!initializing) void initialize(true);
          return true;
        }
        player.loadVideoById(id);
        requestPlayback(player);
        return true;
      },
    };
    commandsRef.current = commands;
    onPlayerReady(commands);
    void initialize(autoPlayRef.current);

    return () => {
      samplePlayback();
      analytics.flush("unmount");
      window.clearInterval(samplingTimer);
      window.removeEventListener("pagehide", flushPlayback);
      document.removeEventListener("visibilitychange", flushPlayback);
      cancelled = true;
      onPlayerReady(null);
      report(false);
      commandsRef.current = null;
      removePlayer();
    };
  }, [onPlayerReady, onPlayingChange, retryKey]);

  useEffect(() => {
    if (initialMenu) {
      initialMenuRef.current = true;
      commandsRef.current?.pauseVideo();
    }
  }, [initialMenu]);

  // A videoId that did not come from a tap - a deep link, browser back - still has to reach the live player.
  useEffect(() => {
    if (initialMenu || loadedIdRef.current === null || loadedIdRef.current === videoId) return;
    commandsRef.current?.loadVideo(videoId, false);
  }, [videoId, initialMenu]);

  const showMenu = (initialMenu && initialMenuRef.current) || status === "paused" || status === "ended";

  return (
    <div className="player-frame" data-testid="player-shell" data-video-stage={!showMenu && status !== "error"} aria-label={`Плеер: ${title}`}>
      <div ref={mountRef} className="youtube-mount" data-testid="youtube-player" hidden={showMenu} inert={showMenu} />

      {}
      {!showMenu && status !== "error" && status !== "loading" && (
        <button
          type="button"
          className="player-tap-layer"
          aria-label={playing ? "Поставить на паузу" : "Включить мультик"}
          data-testid="player-tap-pause"
          data-playing={playing}
          onClick={() => (playing ? commandsRef.current?.pauseVideo() : commandsRef.current?.playVideo())}
        >
          {/* A still picture with no mark is indistinguishable from a broken one for a child who cannot read. */}
          {!playing && status === "ready" && (
            <span className="player-tap-hint" aria-hidden="true"><Play fill="currentColor" /></span>
          )}
          {!playing && playbackNotice && <span className="player-playback-notice" role="status">
            {playbackNotice === "blocked" ? "Браузер просит нажать на видео для запуска" : "Видео ещё не запустилось. Нажми, чтобы повторить"}
          </span>}
        </button>
      )}

      {/* YouTube's own progress bar sits under the tap layer, so this scrubber is the one the child can reach. It lives above the layer and never toggles pause. */}
      {!showMenu && status === "ready" && progress.duration > 0 && (() => {
        const shown = scrubValue ?? progress.current;
        const visible = scrubberAwake || scrubValue !== null;
        const commit = (value: number) => { setScrubValue(null); commandsRef.current?.seekTo(value, true); wakeScrubber(); };
        return (
          <div
            className="player-scrubber"
            data-testid="player-scrubber"
            data-visible={visible}
            onClick={(event) => event.stopPropagation()}
            onPointerEnter={wakeScrubber}
            onPointerMove={wakeScrubber}
            onPointerDown={wakeScrubber}
            onTouchStart={wakeScrubber}
          >
            <span className="player-scrubber-time" data-testid="player-scrubber-current">{formatClock(shown)}</span>
            <input
              type="range"
              className="player-scrubber-range"
              data-testid="player-scrubber-range"
              aria-label="Перемотать мультик"
              min={0}
              max={Math.max(1, Math.floor(progress.duration))}
              step={1}
              value={Math.min(shown, Math.max(1, Math.floor(progress.duration)))}
              style={{ "--played": `${Math.min(100, (shown / progress.duration) * 100)}%` } as React.CSSProperties}
              onChange={(event) => { const value = Number(event.target.value); setScrubValue(value); wakeScrubber(); commandsRef.current?.seekTo(value, false); }}
              onPointerUp={(event) => commit(Number((event.target as HTMLInputElement).value))}
              onTouchEnd={(event) => commit(Number((event.target as HTMLInputElement).value))}
              onKeyUp={(event) => commit(Number((event.target as HTMLInputElement).value))}
              onBlur={(event) => { if (scrubValue !== null) commit(Number(event.target.value)); }}
            />
            <span className="player-scrubber-time" data-testid="player-scrubber-duration">{formatClock(progress.duration)}</span>
          </div>
        );
      })()}

      {showMenu && (
        <div data-testid={`player-${status}`}>
          {renderPauseMenu(status === "ended", () => commandsRef.current?.playVideo())}
        </div>
      )}

      {status === "loading" && !showMenu && (
        <div className="player-status" role="status">
          <LoaderCircle className="spin" aria-hidden="true" />
          <strong>Готовим мультфильм…</strong>
          <span>Обычно это занимает несколько секунд</span>
        </div>
      )}

      {status === "error" && !showMenu && (
        <div className="player-status player-status-error" role="alert" data-testid="player-error">
          <AlertTriangle aria-hidden="true" />
          <strong>Этот мультфильм сейчас не открылся</strong>
          <span>
            {errorCode ? `YouTube вернул ошибку ${errorCode}. ` : ""}
            Можно повторить или выбрать другой мультфильм.
          </span>
          <button type="button" className="button button-primary" onClick={() => { track("video_retry_clicked", { video_id: loadedIdRef.current ?? videoIdRef.current, error_code: errorCode }); setRetryKey((key) => key + 1); }}>
            <Play size={20} aria-hidden="true" />
            Попробовать снова
          </button>
        </div>
      )}
    </div>
  );
}
