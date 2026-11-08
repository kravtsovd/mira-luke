import voiceManifest from "./voice-manifest.json";
import { LUKE_TASKS_PER_GAME } from "./luke-tasks";

export const TODDLER_CAR_GAMES = ["car-voices", "car-workshop", "car-hide"] as const;
export type ToddlerCarGame = (typeof TODDLER_CAR_GAMES)[number];
export const isToddlerCarGame = (value: string): value is ToddlerCarGame => TODDLER_CAR_GAMES.includes(value as ToddlerCarGame);

export const VEHICLES = [
  { id: "fire", name: "Пожарная машина", prompt: "Найди пожарную машину", paint: "#ef5350" },
  { id: "bus", name: "Автобус", prompt: "Найди автобус", paint: "#f7c948" },
  { id: "truck", name: "Грузовик", prompt: "Найди грузовик", paint: "#25ae7a" },
  { id: "digger", name: "Экскаватор", prompt: "Найди экскаватор", paint: "#eea737" },
] as const;
export type VehicleId = (typeof VEHICLES)[number]["id"];
export const PARTS = [
  { id: "wheel", name: "Колесо", prompt: "Дай машинке колесо" },
  { id: "door", name: "Дверь", prompt: "Дай машинке дверь" },
  { id: "light", name: "Фара", prompt: "Дай машинке фару" },
] as const;
export type PartId = (typeof PARTS)[number]["id"];

export const HIDE_GARAGES = 3;
// Session thr_qmx4fhydbe (a parent, 2026-10-08): two rounds per game. The vehicle and the part both change between them.
export const TODDLER_ROUNDS = LUKE_TASKS_PER_GAME;
export const HIDE_GARAGE_LABELS = ["Левый гараж", "Средний гараж", "Правый гараж"] as const;
export const HIDE_WATCH = "Смотри, куда едет машинка";
export const HIDE_FIND = "Где спряталась машинка?";
export const TODDLER_VOICE_PATHS: Record<string, string> = {
  ...Object.fromEntries(VEHICLES.map(v => [v.prompt, voiceManifest.phrases[v.prompt]])),
  ...Object.fromEntries(PARTS.map(p => [p.prompt, voiceManifest.phrases[p.prompt]])),
  [HIDE_WATCH]: voiceManifest.phrases[HIDE_WATCH],
  [HIDE_FIND]: voiceManifest.phrases[HIDE_FIND],
};

export function createToddlerRounds(random: () => number = Math.random) {
  const shuffled = <T,>(items: readonly T[]): T[] => {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };
  const parts = shuffled(PARTS);
  return shuffled(VEHICLES).slice(0, TODDLER_ROUNDS).map((vehicle, index) => {
    const part = parts[index];
    return {
      vehicle,
      vehicles: shuffled([vehicle, shuffled(VEHICLES.filter(v => v.id !== vehicle.id))[0]]),
      part,
      parts: shuffled([part, shuffled(PARTS.filter(p => p.id !== part.id))[0]]),
      garage: Math.floor(random() * HIDE_GARAGES),
    };
  });
}
