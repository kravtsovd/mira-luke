import "server-only";
import { createHash, randomBytes } from "node:crypto";

export const KEY_PREFIX = "mlk_";
export const MAX_ACTIVE_KEYS = 5;
export interface AgentKey { id: string; label: string; prefix: string; createdBy: string; createdAt: string; lastUsedAt: string | null }

const hash = (key: string) => createHash("sha256").update(key).digest("hex");

async function database(path: string, init?: RequestInit) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("Key storage unavailable");
  const response = await fetch(new URL(`/rest/v1/${path}`, base), {
    ...init, cache: "no-store", signal: AbortSignal.timeout(8000),
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" },
  });
  if (!response.ok) throw new Error("Key storage unavailable");
  return await response.json() as Record<string, unknown>[];
}

const toKey = (row: Record<string, unknown>): AgentKey => ({
  id: String(row.id), label: String(row.label), prefix: String(row.key_prefix), createdBy: String(row.created_by),
  createdAt: String(row.created_at), lastUsedAt: row.last_used_at ? String(row.last_used_at) : null,
});

export async function listAgentKeys(familyId: string): Promise<AgentKey[]> {
  const rows = await database(`family_agent_keys?family_id=eq.${encodeURIComponent(familyId)}&revoked_at=is.null&select=*&order=created_at.asc`);
  return rows.map(toKey);
}

export async function createAgentKey(familyId: string, createdBy: string, label: string): Promise<{ key: string; record: AgentKey } | "limit"> {
  if ((await listAgentKeys(familyId)).length >= MAX_ACTIVE_KEYS) return "limit";
  const key = `${KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  const rows = await database("family_agent_keys", { method: "POST", body: JSON.stringify({
    family_id: familyId, label, key_hash: hash(key), key_prefix: key.slice(0, 10), created_by: createdBy,
  }) });
  return { key, record: toKey(rows[0]) };
}

export async function revokeAgentKey(familyId: string, id: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return false;
  const rows = await database(`family_agent_keys?id=eq.${id}&family_id=eq.${encodeURIComponent(familyId)}&revoked_at=is.null`, {
    method: "PATCH", body: JSON.stringify({ revoked_at: new Date().toISOString() }),
  });
  return rows.length > 0;
}

/** The family a Bearer key opens, or null. A key is never looked up by its plaintext. */
export async function familyForAgentKey(request: Request): Promise<{ familyId: string; keyId: string } | null> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(mlk_[A-Za-z0-9_-]{40,60})$/.exec(header.trim());
  if (!match) return null;
  const rows = await database(`family_agent_keys?key_hash=eq.${hash(match[1])}&revoked_at=is.null&select=id,family_id,last_used_at`);
  const row = rows[0];
  if (!row) return null;
  // Touch last_used_at at most once a minute so the parent can see the key is in use.
  if (!row.last_used_at || Date.now() - Date.parse(String(row.last_used_at)) > 60_000) {
    void database(`family_agent_keys?id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify({ last_used_at: new Date().toISOString() }) }).catch(() => undefined);
  }
  return { familyId: String(row.family_id), keyId: String(row.id) };
}
