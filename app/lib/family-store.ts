import "server-only";
import { randomBytes } from "node:crypto";
import { BUILTIN_PROFILE_IDS } from "./profiles";
import { DEFAULT_FAMILY } from "./auth";

export interface FamilyMember { email: string; familyId: string; addedBy?: string }
export const MAX_PARENTS = 10;

async function database(path: string, init?: RequestInit) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("Family storage unavailable");
  const response = await fetch(new URL(`/rest/v1/${path}`, base), {
    ...init, cache: "no-store", signal: AbortSignal.timeout(8000),
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" },
  });
  if (response.status === 409) return null;
  if (!response.ok) throw new Error("Family storage unavailable");
  return await response.json() as Record<string, unknown>[];
}

export const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
};

export async function memberFamily(email: string): Promise<{ familyId: string; familyName: string } | null> {
  const rows = await database(`family_members?email=eq.${encodeURIComponent(email)}&select=family_id,families(name)`);
  const row = rows?.[0];
  if (!row) return null;
  return { familyId: String(row.family_id), familyName: String((row.families as { name?: string } | null)?.name ?? "") };
}

export async function familyName(familyId: string): Promise<string> {
  const rows = await database(`families?id=eq.${encodeURIComponent(familyId)}&select=name`);
  return String(rows?.[0]?.name ?? "");
}

export async function listParents(familyId: string): Promise<FamilyMember[]> {
  const rows = await database(`family_members?family_id=eq.${encodeURIComponent(familyId)}&select=email,family_id,added_by&order=created_at.asc`);
  return (rows ?? []).map(row => ({ email: String(row.email), familyId: String(row.family_id), ...(row.added_by ? { addedBy: String(row.added_by) } : {}) }));
}

/** Returns "exists" when the email already belongs to some family; one email opens exactly one family. */
export async function addParent(familyId: string, email: string, addedBy: string): Promise<"added" | "exists" | "limit"> {
  if ((await listParents(familyId)).length >= MAX_PARENTS) return "limit";
  const rows = await database("family_members", { method: "POST", body: JSON.stringify({ email, family_id: familyId, added_by: addedBy }) });
  return rows ? "added" : "exists";
}

export async function removeParent(familyId: string, email: string): Promise<boolean> {
  const rows = await database(`family_members?family_id=eq.${encodeURIComponent(familyId)}&email=eq.${encodeURIComponent(email)}`, { method: "DELETE" });
  return !!rows?.length;
}

/** Ids of the family's children; Mira and Luke are known without a lookup if the database is unreachable. */
export async function familyChildIds(familyId: string): Promise<string[]> {
  try {
    const rows = await database(`profile_settings?family_id=eq.${encodeURIComponent(familyId)}&select=profile`);
    return (rows ?? []).map(row => String(row.profile));
  } catch {
    return familyId === DEFAULT_FAMILY ? [...BUILTIN_PROFILE_IDS] : [];
  }
}

export async function createFamilyFor(email: string, displayName?: string): Promise<{ familyId: string; familyName: string }> {
  const first = (displayName ?? "").trim().split(/\s+/)[0] || email.split("@")[0];
  const familyName = `Семья ${first}`.slice(0, 60);
  const familyId = `f-${randomBytes(5).toString("hex")}`;
  await database("families", { method: "POST", body: JSON.stringify({ id: familyId, name: familyName }) });
  const added = await database("family_members", { method: "POST", body: JSON.stringify({ email, family_id: familyId, added_by: "self-signup" }) });
  if (!added) {
    // Another tab signed up first; use its family and drop the empty one we just made.
    await database(`families?id=eq.${familyId}`, { method: "DELETE" }).catch(() => null);
    const existing = await memberFamily(email);
    if (existing) return existing;
    throw new Error("Signup race could not be resolved");
  }
  return { familyId, familyName };
}
