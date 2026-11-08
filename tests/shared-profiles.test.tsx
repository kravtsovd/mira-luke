// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import useSharedProfiles from "../app/components/useSharedProfiles";
import { profileSettings, PROFILES_STORAGE_KEY, restoreProfiles } from "../app/lib/profiles";
import type { SharedProfileSettings } from "../app/lib/profile-settings-store";

let rows: SharedProfileSettings[];
beforeEach(() => {
  localStorage.clear();
  rows = ["mira", "luke"].map(profile => ({ profile: profile as "mira" | "luke", settings: profileSettings(profile as "mira" | "luke"), revision: 1 }));
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      const { profile, settings, revision } = JSON.parse(init.body as string);
      const row = rows.find(r => r.profile === profile)!;
      if (row.revision !== revision) return Response.json({ profiles: rows, error: "Newer settings" }, { status: 409 });
      row.settings = settings; row.revision += 1;
      return Response.json({ saved: row });
    }
    return Response.json({ profiles: rows });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

it("loads cloud preferences over an old local cache and keeps this device's active child", async () => {
  const cached = restoreProfiles(null);
  cached.activeProfile = "luke";
  cached.settings.mira.intervalMinutes = 1;
  localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(cached));
  const hook = renderHook(() => useSharedProfiles(false));
  await waitFor(() => expect(hook.result.current.profiles.settings.mira.intervalMinutes).toBe(10));
  expect(hook.result.current.profiles.activeProfile).toBe("luke");
  expect(JSON.parse(localStorage.getItem(PROFILES_STORAGE_KEY)!).settings.mira.intervalMinutes).toBe(10);
  expect(vi.mocked(fetch).mock.calls.every(call => call[1]?.method !== "PUT")).toBe(true);
});
it("propagates a save to a second instance on focus without switching its active profile", async () => {
  const first = renderHook(() => useSharedProfiles(false));
  const second = renderHook(() => useSharedProfiles(false));
  await act(async () => {});
  act(() => second.result.current.persist({ ...second.result.current.profiles, activeProfile: "luke" }));
  await act(async () => { expect(await first.result.current.save("mira", { ...profileSettings("mira"), intervalMinutes: 15 })).toEqual({}); });
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  expect(second.result.current.profiles.settings.mira.intervalMinutes).toBe(15);
  expect(second.result.current.profiles.activeProfile).toBe("luke");
  expect(second.result.current.profiles.settings.luke.intervalMinutes).toBe(5);
});
it("returns newer server settings when two editors conflict", async () => {
  const first = renderHook(() => useSharedProfiles(false));
  const second = renderHook(() => useSharedProfiles(false));
  await act(async () => {});
  await act(async () => { await first.result.current.save("mira", { ...profileSettings("mira"), intervalMinutes: 15 }); });
  await act(async () => {
    expect(await second.result.current.save("mira", { ...profileSettings("mira"), intervalMinutes: 3 })).toMatchObject({ error: "Newer settings", settings: { intervalMinutes: 15 } });
  });
  expect(rows[0].settings.intervalMinutes).toBe(15);
});
it("does not replace the local cache or claim success when the save fails", async () => {
  const hook = renderHook(() => useSharedProfiles(false));
  await act(async () => {});
  vi.mocked(fetch).mockRejectedValue(new Error("offline"));
  await act(async () => { expect((await hook.result.current.save("mira", { ...profileSettings("mira"), intervalMinutes: 15 })).error).toBeTruthy(); });
  expect(hook.result.current.profiles.settings.mira.intervalMinutes).toBe(10);
  expect(JSON.parse(localStorage.getItem(PROFILES_STORAGE_KEY)!).settings.mira.intervalMinutes).toBe(10);
});
it("discards an old GET that resolves after a successful save", async () => {
  const hook = renderHook(() => useSharedProfiles(false));
  await act(async () => {});
  let finish!: (response: Response) => void;
  const oldRows = structuredClone(rows);
  vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  act(() => window.dispatchEvent(new Event("focus")));
  await act(async () => { await hook.result.current.save("mira", { ...profileSettings("mira"), intervalMinutes: 15 }); });
  await act(async () => { finish(Response.json({ profiles: oldRows })); });
  expect(hook.result.current.profiles.settings.mira.intervalMinutes).toBe(15);
});
it("leaves an open editor untouched and refreshes after it closes", async () => {
  const hook = renderHook(({ blocked }) => useSharedProfiles(blocked), { initialProps: { blocked: false } });
  await act(async () => {});
  hook.rerender({ blocked: true });
  rows[0].settings.intervalMinutes = 15; rows[0].revision += 1;
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  expect(hook.result.current.profiles.settings.mira.intervalMinutes).toBe(10);
  hook.rerender({ blocked: false });
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  expect(hook.result.current.profiles.settings.mira.intervalMinutes).toBe(15);
});

it("filters another child's game and unknown IDs from cloud settings before persisting", async () => {
  rows[1].settings.enabledGames = ["huntrix", "unknown", "car-voices"] as never;
  rows[0].settings.enabledGames = ["cars", "huntrix"];
  const hook = renderHook(() => useSharedProfiles(false));
  await act(async () => {});
  expect(hook.result.current.profiles.settings.luke.enabledGames).toEqual(["car-voices"]);
  expect(hook.result.current.profiles.settings.mira.enabledGames).toEqual(["huntrix"]);
  expect(JSON.parse(localStorage.getItem(PROFILES_STORAGE_KEY)!).settings.luke.enabledGames).toEqual(["car-voices"]);
  expect(fetch).toHaveBeenCalledWith("/api/profile-settings", expect.objectContaining({ headers: { "X-Game-Schema": "2" } }));
});

it("adds a child created on another device and drops a deleted one, falling back to Mira", async () => {
  const hook = renderHook(() => useSharedProfiles(false));
  await act(async () => {});
  rows.push({ profile: "c-abc123", name: "Ваня", avatar: "🦊", kind: "toddler", revision: 1, settings: profileSettings("c-abc123", undefined, "toddler") });
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  expect(hook.result.current.profiles.profiles.map(child => child.name)).toEqual(["Mira", "Luke", "Ваня"]);
  expect(hook.result.current.profiles.settings["c-abc123"].enabledGames).toEqual(["cars", "luke-count", "car-people"]);
  act(() => hook.result.current.persist({ ...hook.result.current.profiles, activeProfile: "c-abc123", chosen: true }));
  rows.pop();
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  expect(hook.result.current.profiles.profiles.map(child => child.id)).toEqual(["mira", "luke"]);
  expect(hook.result.current.profiles.activeProfile).toBe("mira");
  expect(hook.result.current.profiles.settings["c-abc123"]).toBeUndefined();
});
it("creates a child through the API and shows it after reloading the list", async () => {
  vi.mocked(fetch).mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url) === "/api/profiles") {
      const body = JSON.parse(init!.body as string);
      const row = { profile: "c-new000000000", revision: 1, settings: profileSettings("c-new000000000", undefined, body.kind), ...body };
      rows.push(row);
      return Response.json({ child: row }, { status: 201 });
    }
    return Response.json({ profiles: rows });
  });
  const hook = renderHook(() => useSharedProfiles(false));
  await act(async () => {});
  let result!: Awaited<ReturnType<typeof hook.result.current.createChild>>;
  await act(async () => { result = await hook.result.current.createChild({ name: "Аня", avatar: "🐰", kind: "preschool" }); });
  expect(result.child).toMatchObject({ id: "c-new000000000", name: "Аня", kind: "preschool" });
  expect(hook.result.current.profiles.profiles.at(-1)).toMatchObject({ name: "Аня", avatar: "🐰" });
  expect(hook.result.current.profiles.settings["c-new000000000"].enabledGames).toEqual(["letters", "counting", "colors", "words", "syllables"]);
});

it("never loads the original family's device cache into a different family", async () => {
  localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(restoreProfiles(null)));
  rows = [];
  const hook = renderHook(() => useSharedProfiles(false, "f-new"));
  expect(hook.result.current.profiles.profiles).toEqual([]);
  expect(hook.result.current.ready).toBe(false);
  await act(async () => {});
  expect(hook.result.current.ready).toBe(true);
  expect(hook.result.current.profiles.profiles).toEqual([]);
  expect(JSON.parse(localStorage.getItem(PROFILES_STORAGE_KEY)!).profiles.map((p: { id: string }) => p.id)).toEqual(["mira", "luke"]);
});
