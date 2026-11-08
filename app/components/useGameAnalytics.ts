import { useEffect, useRef } from "react";
import { analyticsContext, track } from "../lib/analytics";

type Properties = Record<string, string | number | boolean | null | undefined>;

export default function useGameAnalytics(game: string, extra: Properties = {}) {
  const session = useRef({ started: 0, lastAction: 0, attempts: 0, completed: false, idle: false });
  const shared = useRef(extra);
  shared.current = extra;
  useEffect(() => {
    const current = { started: performance.now(), lastAction: performance.now(), attempts: 0, completed: false, idle: false };
    session.current = current;
    const profile = analyticsContext().profile;
    track("game_started", { game, ...shared.current });
    const resetIdle = () => { current.lastAction = performance.now(); current.idle = false; };
    document.addEventListener("visibilitychange", resetIdle);
    const timer = window.setInterval(() => {
      if (!current.completed && !current.idle && document.visibilityState === "visible" && performance.now() - current.lastAction >= 45000) {
        current.idle = true;
        track("game_idle", { game, idle_seconds: 45, attempts: current.attempts, ...shared.current });
      }
    }, 5000);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", resetIdle);
      if (!current.completed) track("game_abandoned", { game, profile, attempts: current.attempts, duration_seconds: Math.round((performance.now() - current.started) / 1000), ...shared.current });
    };
  }, [game]);
  return {
    answer(correct: boolean, method = "tap", details: Properties = {}) {
      const current = session.current;
      current.attempts += 1;
      current.lastAction = performance.now();
      current.idle = false;
      track("game_answered", { game, correct, method, attempt: current.attempts, ...details, ...shared.current });
    },

    repeatInstruction(mode: "voice" | "visual" = "voice") {
      const current = session.current;
      current.lastAction = performance.now();
      current.idle = false;
      track("game_instruction_repeated", { game, repeat_mode: mode, attempts_before_repeat: current.attempts, ...shared.current });
    },
    complete() {
      const current = session.current;
      if (current.completed) return;
      current.completed = true;
      track("game_completed", { game, attempts: current.attempts, duration_seconds: Math.round((performance.now() - current.started) / 1000), ...shared.current });
    },
  };
}
