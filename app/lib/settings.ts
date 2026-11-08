export const GAME_TYPES = ["letters", "counting", "colors", "words", "syllables"] as const;

export type GameType = (typeof GAME_TYPES)[number] | "mira-addition" | "huntrix-letters" | "cars" | "huntrix" | "luke-count" | "car-people" | "english-find" | "car-puzzle" | import("./toddler-cars").ToddlerCarGame | import("./luke-tap-games").LukeTapGame;

export interface AppSettings {
  menuLayout: MenuLayout;
  learningEnabled: boolean;
  intervalMinutes: number;
  soundEnabled: boolean;
  enabledGames: GameType[];
}

export const MENU_LAYOUTS = ["feed", "carousel", "grid"] as const;
export type MenuLayout = (typeof MENU_LAYOUTS)[number];
export function isMenuLayout(value: unknown): value is MenuLayout {
  return MENU_LAYOUTS.includes(value as MenuLayout);
}

export const TEST_INTERVAL_MINUTES = 3 / 60;
export const INTERVAL_OPTIONS = [1, 3, 5, 10, 15, TEST_INTERVAL_MINUTES] as const;

export const DEFAULT_SETTINGS: AppSettings = {
  menuLayout: "feed",
  learningEnabled: false,
  intervalMinutes: 5,
  soundEnabled: true,
  enabledGames: [...GAME_TYPES],
};

export const SETTINGS_STORAGE_KEY = "mira-cartoon-game-settings-v2";

export function normalizeSettings(value: unknown, defaults = DEFAULT_SETTINGS, availableGames: readonly GameType[] = GAME_TYPES): AppSettings {
  if (!value || typeof value !== "object") {
    return { ...defaults, enabledGames: [...defaults.enabledGames] };
  }

  const candidate = value as Partial<AppSettings>;
  const intervalMinutes = INTERVAL_OPTIONS.includes(
    candidate.intervalMinutes as (typeof INTERVAL_OPTIONS)[number],
  )
    ? (candidate.intervalMinutes as number)
    : defaults.intervalMinutes;

  const enabledGames = Array.isArray(candidate.enabledGames)
    ? candidate.enabledGames.filter((game): game is GameType =>
        availableGames.includes(game as GameType),
      )
    : [...defaults.enabledGames];

  return {
    menuLayout: isMenuLayout(candidate.menuLayout) ? candidate.menuLayout : defaults.menuLayout,
    learningEnabled: typeof candidate.learningEnabled === "boolean" ? candidate.learningEnabled : defaults.learningEnabled,
    intervalMinutes,
    soundEnabled:
      typeof candidate.soundEnabled === "boolean"
        ? candidate.soundEnabled
        : defaults.soundEnabled,
    enabledGames: enabledGames.length > 0 ? Array.from(new Set(enabledGames)) : [...defaults.enabledGames],
  };
}

export function formatCountdown(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
