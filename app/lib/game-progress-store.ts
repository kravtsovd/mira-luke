import "server-only";
import { EnglishProgress, RoundResult, applyRound, freshProgress, parseEnglishProgress } from "./english-find";

const BUCKET = "game-progress";
const KEEP_ROUND_IDS = 200;
interface StoredProgress { progress: EnglishProgress; roundIds: string[]; updatedAt: string }

function storage(path: string, init?: RequestInit) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("Progress storage unavailable");
  return fetch(new URL(`/storage/v1/${path}`, base), {
    ...init, cache: "no-store", signal: AbortSignal.timeout(8000),
    headers: { apikey: key, Authorization: `Bearer ${key}`, ...init?.headers },
  });
}

const objectPath = (profile: string) => `${BUCKET}/${profile}/english-find.json`;

async function readStored(profile: string): Promise<StoredProgress> {
  const response = await storage(`object/authenticated/${objectPath(profile)}`);
  if (response.status === 400 || response.status === 404) return { progress: freshProgress(), roundIds: [], updatedAt: "" };
  if (!response.ok) throw new Error("Progress storage unavailable");
  const value = await response.json() as Partial<StoredProgress>;
  return {
    progress: parseEnglishProgress(value.progress) ?? freshProgress(),
    roundIds: Array.isArray(value.roundIds) ? value.roundIds.filter((id): id is string => typeof id === "string").slice(-KEEP_ROUND_IDS) : [],
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
  };
}

async function writeStored(profile: string, stored: StoredProgress) {
  const body = JSON.stringify(stored);
  const put = () => storage(`object/${objectPath(profile)}`, { method: "POST", body, headers: { "Content-Type": "application/json", "x-upsert": "true", "cache-control": "no-cache" } });
  let response = await put();
  if (response.status === 400 || response.status === 404) {
    // First write on a fresh project: create the private bucket once, then retry.
    await storage("bucket", { method: "POST", body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }), headers: { "Content-Type": "application/json" } });
    response = await put();
  }
  if (!response.ok) throw new Error("Progress storage unavailable");
}

export async function readSharedEnglishProgress(profile: string): Promise<EnglishProgress> {
  return (await readStored(profile)).progress;
}

export async function recordSharedEnglishRound(profile: string, round: RoundResult) {
  const stored = await readStored(profile);
  if (stored.roundIds.includes(round.id)) return { progress: stored.progress, levelUp: false, reason: null, duplicate: true };
  const scored = applyRound(stored.progress, round);
  await writeStored(profile, { progress: scored.progress, roundIds: [...stored.roundIds, round.id].slice(-KEEP_ROUND_IDS), updatedAt: new Date().toISOString() });
  return { ...scored, duplicate: false };
}
