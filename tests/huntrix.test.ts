import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { NAME_CARDS } from "../app/lib/huntrix";
import { availableGames, profileSettings, restoreProfiles } from "../app/lib/profiles";

describe("Huntrix learning", () => {
  it("has seven distinct simple names with local images", () => {
    expect(new Set(NAME_CARDS.map(card => card.id)).size).toBe(7);
    for (const card of NAME_CARDS) expect(existsSync(`public${card.image}`)).toBe(true);
  });
  it("applies the ten-minute Mira preset once and preserves later parental choices", () => {
    const store = restoreProfiles({ settings: { mira: { enabledGames: ["letters"], intervalMinutes: 5, learningEnabled: false } } });
    expect(store.settings.mira.enabledGames).toEqual(["huntrix"]);
    expect(store.settings.mira).toMatchObject({ intervalMinutes: 10, learningEnabled: true });
    store.settings.mira = { ...store.settings.mira, enabledGames: ["letters"], intervalMinutes: 15, learningEnabled: false };
    expect(restoreProfiles(store).settings.mira).toMatchObject({ enabledGames: ["letters"], intervalMinutes: 15, learningEnabled: false });
    expect(profileSettings("mira").enabledGames).toContain("huntrix");
  });
  it("belongs to Mira and preserves saved timer choices", () => {
    expect(availableGames("mira")).toContain("huntrix");
    expect(availableGames("luke")).not.toContain("huntrix");
    expect(profileSettings("mira", { enabledGames: ["huntrix"] }).enabledGames).toEqual(["huntrix"]);
    expect(profileSettings("mira", { enabledGames: ["letters"] }).enabledGames).toEqual(["letters"]);
    expect(profileSettings("luke", { enabledGames: ["huntrix"] }).enabledGames).toEqual(["cars", "luke-count", "car-people"]);
  });
});
