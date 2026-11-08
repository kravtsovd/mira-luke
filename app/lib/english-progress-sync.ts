import { EnglishProgress, RoundResult, parseEnglishProgress, saveEnglishProgress } from "./english-find";

const PENDING_KEY = "mira-english-find-pending-v1";
const PROFILE = "mira";

function readPending(): RoundResult[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(PENDING_KEY) || "[]");
    return Array.isArray(value)
      ? value.filter(row => row && typeof row.id === "string" && [1, 2, 3, 4].includes(row.level) && typeof row.clean === "boolean").slice(-50)
      : [];
  } catch { return []; }
}
function writePending(rounds: RoundResult[]) {
  try { window.localStorage.setItem(PENDING_KEY, JSON.stringify(rounds)); } catch { /* The round stays only in memory. */ }
}

export const newRoundId = () => typeof crypto !== "undefined" && "randomUUID" in crypto
  ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

let flushing: Promise<EnglishProgress | null> | null = null;

// Sends queued rounds in order and stops at the first network or server failure, keeping the rest for the next try.
export function flushEnglishRounds(): Promise<EnglishProgress | null> {
  if (flushing) return flushing;
  flushing = (async () => {
    let latest: EnglishProgress | null = null;
    for (const round of readPending()) {
      try {
        const response = await fetch("/api/game-progress", {
          method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
          body: JSON.stringify({ profile: PROFILE, round }), signal: AbortSignal.timeout(10_000),
        });
        if (response.status >= 500 || response.status === 429) break;
        const body = await response.json().catch(() => ({}));
        writePending(readPending().filter(row => row.id !== round.id));
        const parsed = response.ok ? parseEnglishProgress(body.progress) : null;
        if (parsed) { latest = parsed; saveEnglishProgress(parsed); }
      } catch { break; }
    }
    return latest;
  })().finally(() => { flushing = null; });
  return flushing;
}

export function queueEnglishRound(round: RoundResult): Promise<EnglishProgress | null> {
  writePending([...readPending().filter(row => row.id !== round.id), round]);
  return flushEnglishRounds();
}

export const pendingEnglishRounds = () => readPending().length;

export async function loadSharedEnglishProgress(): Promise<EnglishProgress | null> {
  await flushEnglishRounds();
  if (readPending().length) return null; // Unsent rounds are missing from the server copy; keep the local view.
  try {
    const response = await fetch(`/api/game-progress?profile=${PROFILE}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return null;
    const parsed = parseEnglishProgress((await response.json()).progress);
    if (parsed) saveEnglishProgress(parsed);
    return parsed;
  } catch { return null; }
}
