import { describe, expect, it } from "vitest";
import { availableGames, profileSettings, restoreProfiles } from "../app/lib/profiles";

describe("child profiles", () => {
  it("migrates existing preferences to Mira and gives Luke five-minute car breaks", () => {
    const result = restoreProfiles(null, { intervalMinutes: 10, soundEnabled: false, menuLayout: "grid" });
    expect(result.settings.mira).toMatchObject({ intervalMinutes: 10, soundEnabled: false, menuLayout: "grid", learningEnabled: true });
    expect(result.settings.luke).toMatchObject({ intervalMinutes: 5, soundEnabled: true, learningEnabled: true, enabledGames: ["cars", "luke-count", "car-people"] });
  });
  it("restores each child's own preferences and the last selected profile", () => {
    const result = restoreProfiles({ gamesVersion: 2, activeProfile: "luke", settings: {
      mira: { intervalMinutes: 15, enabledGames: ["letters"] },
      luke: { intervalMinutes: 3, learningEnabled: false, enabledGames: ["cars"] },
    } });
    expect(result.activeProfile).toBe("luke");
    expect(result.settings.mira.intervalMinutes).toBe(15);
    expect(result.settings.luke.intervalMinutes).toBe(3);
    expect(result.settings.luke.learningEnabled).toBe(false);
  });
  it("never admits the car game to Mira, including tampered storage", () => {
    expect(availableGames("mira")).not.toContain("cars");
    expect(availableGames("mira")).not.toContain("car-people");
    expect(profileSettings("mira", { enabledGames: ["cars"] }).enabledGames).not.toContain("cars");
    expect(profileSettings("luke", { enabledGames: ["unknown"], intervalMinutes: -1 }).enabledGames).toEqual(["cars", "luke-count", "car-people"]);
    expect(restoreProfiles({ activeProfile: "unknown", settings: null }).activeProfile).toBe("mira");
  });
});


it("keeps legacy videos shared and explicit memberships separate", async () => {
  const { belongsToProfile } = await import("../app/lib/profiles");
  const { VIDEOS } = await import("../app/data/catalog");
  expect(belongsToProfile(VIDEOS[0], "mira")).toBe(true);
  expect(belongsToProfile(VIDEOS[0], "luke")).toBe(true);
  expect(belongsToProfile({ ...VIDEOS[0], profiles: ["luke"] }, "mira")).toBe(false);
  expect(belongsToProfile({ ...VIDEOS[0], profiles: [] }, "mira")).toBe(true);
});
