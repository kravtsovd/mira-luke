import { describe, expect, it } from "vitest";
import { createToddlerRounds, HIDE_FIND, HIDE_GARAGE_LABELS, HIDE_GARAGES, HIDE_WATCH, PARTS, TODDLER_CAR_GAMES, TODDLER_ROUNDS, VEHICLES } from "../app/lib/toddler-cars";
import { LUKE_TASKS_PER_GAME } from "../app/lib/luke-tasks";
import { availableGames, profileSettings } from "../app/lib/profiles";
import { SPEECH_AUDIO_PATHS } from "../app/lib/speech";

describe("Luke's toddler car games", () => {
  it("offers two rounds with distinct targets, two unambiguous choices, and all three garage positions", () => {
    expect(TODDLER_ROUNDS).toBe(LUKE_TASKS_PER_GAME);
    expect(TODDLER_ROUNDS).toBe(2);
    expect(HIDE_GARAGES).toBe(3);
    expect(HIDE_GARAGE_LABELS).toHaveLength(HIDE_GARAGES);
    const sides = new Set<number>();
    const partPairs = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const rounds = createToddlerRounds(() => i / 100);
      expect(rounds).toHaveLength(TODDLER_ROUNDS);
      expect(new Set(rounds.map(r => r.vehicle.id)).size).toBe(TODDLER_ROUNDS);
      expect(new Set(rounds.map(r => r.part.id)).size).toBe(TODDLER_ROUNDS);
      for (const round of rounds) expect(PARTS.map(p => p.id)).toContain(round.part.id);
      partPairs.add(rounds.map(r => r.part.id).sort().join());
      for (const round of rounds) {
        expect(new Set(round.vehicles.map(v => v.id)).size).toBe(2);
        expect(round.vehicles.filter(v => v.id === round.vehicle.id)).toHaveLength(1);
        expect(new Set(round.parts.map(p => p.id)).size).toBe(2);
        expect(round.parts.filter(p => p.id === round.part.id)).toHaveLength(1);
        expect([0, 1, 2]).toContain(round.garage);
        sides.add(round.garage);
      }
    }
    expect(sides.size).toBe(HIDE_GARAGES);
    // The workshop no longer always asks for the wheel and the door: every pair of parts comes up.
    expect(partPairs.size).toBe(3);
  });
  it("keeps all three games out of Mira's settings, including forged saves", () => {
    for (const game of TODDLER_CAR_GAMES) {
      expect(availableGames("luke")).toContain(game);
      expect(availableGames("mira")).not.toContain(game);
      expect(profileSettings("mira", { enabledGames: [game] }).enabledGames).not.toContain(game);
      expect(profileSettings("luke", { enabledGames: [game] }).enabledGames).toEqual([game]);
    }
  });
  it("records every task rather than depending on device Russian voices", () => {
    for (const prompt of [...VEHICLES.map(v => v.prompt), ...PARTS.map(p => p.prompt), HIDE_FIND, HIDE_WATCH]) {
      expect(SPEECH_AUDIO_PATHS[prompt]).toMatch(/^tts:/);
    }
  });
});
