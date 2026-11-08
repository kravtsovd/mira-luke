"use client";

import { useEffect, useRef, useState } from "react";
import { ChildProfile, mergeDirectory, NewChildKind, normalizeChild, ProfileId, ProfileStore, PROFILES_STORAGE_KEY, restoreProfiles, profileSettings } from "../lib/profiles";
import { AppSettings, SETTINGS_STORAGE_KEY } from "../lib/settings";
import type { SharedProfileSettings } from "../lib/profile-settings-store";

export type SettingsSaveResult = { error?: string; settings?: AppSettings };
export type ChildChangeResult = { error?: string; child?: ChildProfile };
const unavailable = "Нет связи с сервером настроек. Пока используются настройки этого устройства.";
const clientHeaders = { "X-Game-Schema": "2" };

function parseRows(value: unknown): SharedProfileSettings[] {
  const rows = (value as { profiles?: SharedProfileSettings[] })?.profiles;
  if (!Array.isArray(rows) || !rows.every(row => typeof row?.profile === "string" && row.settings && Number.isSafeInteger(row.revision) && row.revision > 0)) throw new Error("Invalid settings response");
  return rows;
}

export default function useSharedProfiles(blockRefresh: boolean, familyId = "demo") {
  // Only the original family may reuse its legacy device cache.
  const storageKey = familyId === "demo" ? PROFILES_STORAGE_KEY : `${PROFILES_STORAGE_KEY}:${familyId}`;
  const emptyStore = () => restoreProfiles({ profiles: [], chosen: false });
  const [profiles, setProfiles] = useState<ProfileStore>(() => familyId === "demo" ? restoreProfiles(null) : emptyStore());
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const current = useRef(profiles);
  const revisions = useRef<Partial<Record<ProfileId, number>>>({});
  const blocked = useRef(blockRefresh);
  blocked.current = blockRefresh;
  const writing = useRef(false);
  const generation = useRef(0);

  function persist(next: ProfileStore) {
    current.current = next;
    setProfiles(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); }
    catch { setNotice("Общие настройки доступны, но браузер не разрешил сохранить копию для работы без сети."); }
  }

  // A full list is authoritative for who exists; a single saved row only updates that child.
  function apply(rows: SharedProfileSettings[], complete = true) {
    const next = { ...current.current, settings: { ...current.current.settings } };
    let changed = false;
    if (complete) {
      const directory = mergeDirectory(rows.map(normalizeChild));
      if (JSON.stringify(directory) !== JSON.stringify(next.profiles)) {
        changed = true;
        next.profiles = directory;
        for (const id of Object.keys(next.settings)) if (!directory.some(child => child.id === id)) { delete next.settings[id]; delete revisions.current[id]; }

        if (!directory.some(child => child.id === next.activeProfile)) next.activeProfile = directory[0]?.id ?? "";
      }
    }
    for (const row of rows) {
      const child = next.profiles.find(item => item.id === row.profile);
      if (!child || row.revision <= (revisions.current[row.profile] ?? 0)) continue;
      changed = true;
      next.settings[row.profile] = profileSettings(row.profile, row.settings, child.kind);
      revisions.current[row.profile] = row.revision;
    }
    if (changed) persist(next);
  }

  async function readAll() {
    const response = await fetch("/api/profile-settings", { headers: clientHeaders, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error();
    return parseRows(await response.json());
  }

  useEffect(() => {
    let active = true;
    const read = (key: string) => {
      try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : undefined; }
      catch { return undefined; }
    };
    const legacy = familyId === "demo" ? read(SETTINGS_STORAGE_KEY) : undefined;
    const cached = read(storageKey);
    const restored = cached !== undefined || familyId === "demo" ? restoreProfiles(cached, legacy) : emptyStore();
    // A device that already used the single-profile app has made its choice.
    if (legacy !== undefined) restored.chosen = true;
    current.current = restored;
    setProfiles(restored);
    setReady(cached !== undefined || familyId === "demo");
    let reading = false;
    const refresh = async () => {
      if (reading || writing.current || blocked.current || document.visibilityState === "hidden") return;
      reading = true;
      const at = generation.current;
      try {
        const rows = await readAll();

        if (active && at === generation.current && !blocked.current) { setNotice(""); apply(rows); }
      } catch { if (active && at === generation.current) setNotice(unavailable); }
      finally { reading = false; if (active) setReady(true); }
    };
    void refresh();
    const timer = window.setInterval(refresh, 15_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  async function save(profile: ProfileId, settings: AppSettings): Promise<SettingsSaveResult> {
    writing.current = true;
    generation.current += 1;
    try {
      const revision = revisions.current[profile];
      if (!revision) {
        const rows = await readAll();
        setNotice(""); apply(rows);
        return { error: "Загружены общие настройки. Проверьте их и сохраните изменения.", settings: current.current.settings[profile] };
      }
      const response = await fetch("/api/profile-settings", {
        method: "PUT", headers: { ...clientHeaders, "Content-Type": "application/json" }, cache: "no-store", signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({ profile, settings, revision }),
      });
      const payload = await response.json();
      if (response.status === 409) {
        setNotice(""); apply(parseRows(payload));
        return { error: payload.error, settings: current.current.settings[profile] };
      }
      if (response.status === 404) {
        apply(await readAll());
        return { error: payload.error };
      }
      if (!response.ok || !payload.saved || payload.saved.profile !== profile) throw new Error();
      setNotice(""); apply([payload.saved], false);
      return {};
    } catch {
      return { error: "Не удалось сохранить на всех устройствах. Проверьте интернет и нажмите «Сохранить» ещё раз." };
    } finally { writing.current = false; }
  }

  async function changeChildren(method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>): Promise<ChildChangeResult> {
    writing.current = true;
    generation.current += 1;
    try {
      const response = await fetch("/api/profiles", {
        method, headers: { "Content-Type": "application/json" }, cache: "no-store", signal: AbortSignal.timeout(10_000), body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 404) apply(await readAll().catch(() => []), false);
        return { error: payload.error ?? "Не удалось сохранить. Попробуйте ещё раз." };
      }
      // An adult who manages the children on this device has set it up; the first-launch picker must not cover them.
      if (!current.current.chosen) persist({ ...current.current, chosen: true });
      // The full list after any change keeps order, names and removals identical on every device.
      setNotice(""); apply(await readAll());
      return { child: payload.child ? normalizeChild(payload.child) ?? undefined : undefined };
    } catch {
      return { error: "Нет связи с сервером. Проверьте интернет и попробуйте ещё раз." };
    } finally { writing.current = false; }
  }

  const createChild = (input: { name: string; avatar: string; kind: NewChildKind }) => changeChildren("POST", input);
  const renameChild = (profile: ProfileId, change: { name?: string; avatar?: string }) => changeChildren("PATCH", { profile, ...change });
  const deleteChild = (profile: ProfileId) => changeChildren("DELETE", { profile });

  return { profiles, ready, notice, persist, save, createChild, renameChild, deleteChild };
}
