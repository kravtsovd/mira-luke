import "server-only";
import { randomBytes } from "node:crypto";
import { BUILTIN_PROFILE_IDS, ChildProfile, MAX_PROFILES, NewChildKind, ProfileId, ProfileKind, isProfileKind, kindOf, profileSettings } from "./profiles";
import { AppSettings } from "./settings";
import { DEFAULT_FAMILY } from "./auth";

const fam = (familyId: string) => `family_id=eq.${encodeURIComponent(familyId)}`;

export interface SharedProfileSettings {
  profile: ProfileId; settings: AppSettings; revision: number;
  name?: string; avatar?: string; kind?: ProfileKind; sortOrder?: number;
}
interface Row { profile: ProfileId; settings: AppSettings; revision: number; name?: string; avatar?: string; kind?: string; sort_order?: number }
const COLUMNS = "profile,settings,revision,name,avatar,kind,sort_order";

export class ProfileStoreError extends Error {
  constructor(public code: "conflict" | "limit" | "missing" | "unavailable", message: string) { super(message); }
}

async function database(path: string, init?: RequestInit) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("Settings storage unavailable");
  const response = await fetch(new URL(`/rest/v1/${path}`, base), {
    ...init, cache: "no-store", signal: AbortSignal.timeout(8000),
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" },
  });
  if (response.status === 409) throw new ProfileStoreError("conflict", "Profile already exists");
  if (!response.ok) throw new Error("Settings storage unavailable");
  return await response.json() as Row[];
}

function toShared(row: Row): SharedProfileSettings {
  const kind = kindOf(row.profile, isProfileKind(row.kind) ? row.kind : undefined);
  return {
    profile: row.profile, revision: row.revision, settings: profileSettings(row.profile, row.settings, kind),
    ...(row.name ? { name: row.name } : {}), ...(row.avatar ? { avatar: row.avatar } : {}), kind,
    sortOrder: Number.isSafeInteger(row.sort_order) ? row.sort_order : undefined,
  };
}

export async function readSharedSettings(familyId = DEFAULT_FAMILY) {
  const rows = await database(`profile_settings?select=${COLUMNS}&${fam(familyId)}&order=sort_order.asc,created_at.asc`);
  if (familyId === DEFAULT_FAMILY && !BUILTIN_PROFILE_IDS.every(profile => rows.some(row => row.profile === profile && Number.isSafeInteger(row.revision) && row.revision > 0))) {
    throw new Error("Settings storage incomplete");
  }
  return rows.map(toShared);
}

export async function readChild(profile: ProfileId, familyId = DEFAULT_FAMILY): Promise<SharedProfileSettings | null> {
  const rows = await database(`profile_settings?profile=eq.${encodeURIComponent(profile)}&${fam(familyId)}&select=${COLUMNS}`);
  return rows[0] ? toShared(rows[0]) : null;
}

export async function writeSharedSettings(profile: ProfileId, settings: AppSettings, revision: number, familyId = DEFAULT_FAMILY) {

  const rows = await database(`profile_settings?profile=eq.${encodeURIComponent(profile)}&revision=eq.${revision}&${fam(familyId)}&select=${COLUMNS}`, {
    method: "PATCH", body: JSON.stringify({ settings, revision: revision + 1, updated_at: new Date().toISOString() }),
  });
  return rows[0] ? toShared(rows[0]) : null;
}

export async function createChild(input: { name: string; avatar: string; kind: NewChildKind }, familyId = DEFAULT_FAMILY): Promise<SharedProfileSettings> {
  const existing = await database(`profile_settings?select=profile,sort_order&${fam(familyId)}`);
  if (existing.length >= MAX_PROFILES) throw new ProfileStoreError("limit", "Too many children");
  const sortOrder = existing.length ? Math.max(...existing.map(row => row.sort_order ?? 0)) + 1 : 0;
  // A random id never collides with a deleted child's leftovers and reveals nothing about the name.
  const id = `c-${randomBytes(6).toString("hex")}`;
  const rows = await database(`profile_settings?select=${COLUMNS}`, {
    method: "POST",
    body: JSON.stringify({ profile: id, family_id: familyId, name: input.name, avatar: input.avatar, kind: input.kind, sort_order: sortOrder, settings: profileSettings(id, undefined, input.kind), revision: 1 }),
  });
  if (!rows[0]) throw new Error("Settings storage unavailable");
  return toShared(rows[0]);
}

export async function renameChild(profile: ProfileId, change: Partial<Pick<ChildProfile, "name" | "avatar">>, familyId = DEFAULT_FAMILY) {
  const rows = await database(`profile_settings?profile=eq.${encodeURIComponent(profile)}&${fam(familyId)}&select=${COLUMNS}`, {
    method: "PATCH", body: JSON.stringify({ ...change, updated_at: new Date().toISOString() }),
  });
  if (!rows[0]) throw new ProfileStoreError("missing", "Child not found");
  return toShared(rows[0]);
}

export async function deleteChild(profile: ProfileId, familyId = DEFAULT_FAMILY) {
  if (!await readChild(profile, familyId)) throw new ProfileStoreError("missing", "Child not found");
  const rows = await database("rpc/delete_child_profile", { method: "POST", body: JSON.stringify({ child_profile: profile }) });
  if (!rows.length) throw new ProfileStoreError("missing", "Child not found");
}
