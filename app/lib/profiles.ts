import type { CartoonVideo } from "../data/catalog";
import { TODDLER_CAR_GAMES } from "./toddler-cars";
import { LUKE_TAP_GAMES } from "./luke-tap-games";
import { CAR_PUZZLE_GAME } from "./car-puzzle";
import { AppSettings, DEFAULT_SETTINGS, GAME_TYPES, GameType, normalizeSettings } from "./settings";

export const BUILTIN_PROFILE_IDS = ["mira", "luke"] as const;
/** @deprecated The family can have more children; use the profile directory. */
export const PROFILE_IDS = BUILTIN_PROFILE_IDS;
export type BuiltinProfileId = (typeof BUILTIN_PROFILE_IDS)[number];
export type ProfileId = string;
export const PROFILE_KINDS = ["mira", "luke", "toddler", "preschool"] as const;
export type ProfileKind = (typeof PROFILE_KINDS)[number];
/** The two game sets a parent can give a new child; Mira's and Luke's own games are built around them. */
export const NEW_CHILD_KINDS = ["toddler", "preschool"] as const;
export type NewChildKind = (typeof NEW_CHILD_KINDS)[number];

export interface ChildProfile { id: ProfileId; name: string; avatar: string; kind: ProfileKind }

export const PROFILES: Record<BuiltinProfileId, ChildProfile> = {
  mira: { id: "mira", name: "Mira", avatar: "🌸", kind: "mira" },
  luke: { id: "luke", name: "Luke", avatar: "🚙", kind: "luke" },
};
export const BUILTIN_PROFILES: ChildProfile[] = BUILTIN_PROFILE_IDS.map(id => PROFILES[id]);
export const PROFILE_AVATARS = ["🦊", "🐻", "🐰", "🦄", "🐼", "🐯", "🐸", "🦁", "🐶", "🐱", "🚀", "⭐"] as const;
export const MAX_PROFILES = 8;
export const MAX_PROFILE_NAME = 24;
export const PROFILES_STORAGE_KEY = "mira-luke-profiles-v1";

export const isProfileId = (value: unknown): value is ProfileId =>
  typeof value === "string" && /^[a-z][a-z0-9-]{1,31}$/.test(value);
export const isBuiltinProfile = (value: unknown): value is BuiltinProfileId =>
  BUILTIN_PROFILE_IDS.includes(value as BuiltinProfileId);
export const isNewChildKind = (value: unknown): value is NewChildKind =>
  NEW_CHILD_KINDS.includes(value as NewChildKind);
export const isProfileKind = (value: unknown): value is ProfileKind =>
  PROFILE_KINDS.includes(value as ProfileKind);

/** A built-in child's kind cannot be changed; any other child falls back to the gentlest game set. */
export function kindOf(profile: ProfileId, kind?: ProfileKind): ProfileKind {
  if (isBuiltinProfile(profile)) return profile;
  return kind && isNewChildKind(kind) ? kind : "preschool";
}

export const KIND_LABELS: Record<NewChildKind, { title: string; description: string }> = {
  toddler: { title: "Малыш, машинки", description: "Игры как у Люка: машинки, счёт до трёх, голоса машин" },
  preschool: { title: "Буквы и счёт", description: "Буквы, счёт, цвета, слова и слоги" },
};

/** Old cache entries and builtin rows may lack directory fields; the server is the source of truth. */
export function normalizeChild(value: unknown): ChildProfile | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<ChildProfile> & { profile?: unknown };
  const id = raw.id ?? raw.profile;
  if (!isProfileId(id)) return null;
  const fallback = isBuiltinProfile(id) ? PROFILES[id] : undefined;
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, MAX_PROFILE_NAME) : fallback?.name;
  const avatar = typeof raw.avatar === "string" && raw.avatar.trim() ? raw.avatar.trim().slice(0, 16) : fallback?.avatar ?? "⭐";
  if (!name) return null;
  return { id, name, avatar, kind: kindOf(id, isProfileKind(raw.kind) ? raw.kind : undefined) };
}

export interface ProfileStore {
  gamesVersion?: 1 | 2;
  activeProfile: ProfileId;
  settings: Record<ProfileId, AppSettings>;
  /** Every child in the family, Mira and Luke first. Cached so a device without network still shows them. */
  profiles: ChildProfile[];
  /** False until someone on this device has picked a child. */
  chosen?: boolean;
}

export function availableGames(profile: ProfileId, kind?: ProfileKind): readonly GameType[] {
  switch (kindOf(profile, kind)) {
    case "mira": return ["mira-addition", "huntrix-letters", "huntrix", "english-find", ...GAME_TYPES];
    case "luke": case "toddler": return ["cars", "luke-count", "car-people", ...TODDLER_CAR_GAMES, ...LUKE_TAP_GAMES, CAR_PUZZLE_GAME, ...GAME_TYPES];
    default: return [...GAME_TYPES];
  }
}

export function profileSettings(profile: ProfileId, value?: unknown, kind?: ProfileKind): AppSettings {
  const resolved = kindOf(profile, kind);
  const defaults: AppSettings = resolved === "luke" || resolved === "toddler"
    ? { ...DEFAULT_SETTINGS, learningEnabled: true, intervalMinutes: 5, enabledGames: ["cars", "luke-count", "car-people"] }
    : resolved === "mira"
      ? { ...DEFAULT_SETTINGS, learningEnabled: true, intervalMinutes: 10, enabledGames: ["huntrix"] }
      : { ...DEFAULT_SETTINGS, learningEnabled: true, intervalMinutes: 10, enabledGames: [...GAME_TYPES] };
  return normalizeSettings(value, defaults, availableGames(profile, resolved));
}

export function findChild(store: Pick<ProfileStore, "profiles">, profile: ProfileId): ChildProfile {
  return store.profiles.find(child => child.id === profile) ?? (isBuiltinProfile(profile) ? PROFILES[profile] : { id: profile, name: "…", avatar: "⭐", kind: kindOf(profile) });
}

export const builtinName = (profile: ProfileId) => isBuiltinProfile(profile) ? PROFILES[profile].name : "ребёнка";

/** A family's children in the server's order, Mira and Luke first when they are in it. Without any data yet
 * (a brand-new device of the default family) Mira and Luke stand in until the server answers. */
export function mergeDirectory(children: (ChildProfile | null)[], withBuiltins = false): ChildProfile[] {
  const seen = new Set<string>();
  const valid = children.filter((child): child is ChildProfile => !!child && !seen.has(child.id) && !!seen.add(child.id));
  const builtins = BUILTIN_PROFILES.flatMap(builtin => {
    const found = valid.find(child => child.id === builtin.id);
    return found ? [found] : withBuiltins ? [builtin] : [];
  });
  return [...builtins, ...valid.filter(child => !isBuiltinProfile(child.id))].slice(0, MAX_PROFILES);
}

export function restoreProfiles(value: unknown, legacySettings?: unknown): ProfileStore {
  const candidate = value && typeof value === "object" ? value as Partial<ProfileStore> : {};

  const directory = Array.isArray(candidate.profiles) ? mergeDirectory(candidate.profiles.map(normalizeChild)) : mergeDirectory([], true);
  const mira = profileSettings("mira", candidate.settings?.mira ?? legacySettings);

  if (candidate.gamesVersion !== 2) {
    mira.enabledGames = ["huntrix"];
    mira.learningEnabled = true;
    mira.intervalMinutes = 10;
  }
  const settings: Record<ProfileId, AppSettings> = {};
  for (const child of directory) settings[child.id] = child.id === "mira" ? mira : profileSettings(child.id, candidate.settings?.[child.id], child.kind);
  const active = directory.some(child => child.id === candidate.activeProfile) ? candidate.activeProfile as ProfileId : directory[0]?.id ?? "";
  return {
    gamesVersion: 2,
    activeProfile: active,
    settings,
    profiles: directory,
    chosen: candidate.chosen === true || (value !== null && value !== undefined && candidate.chosen === undefined),
  };
}

// Empty membership follows the shared-catalog convention used by the curated video picks.
export function belongsToProfile(video: CartoonVideo, profile: ProfileId): boolean {
  return !video.profiles?.length || video.profiles.includes(profile);
}
