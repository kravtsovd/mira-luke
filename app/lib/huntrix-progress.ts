import { NAME_CARDS, NameCard, NameId, ROUND_SIZE } from "./huntrix";

export type NameResult = { rounds: number; perfect: number; errors: number; cleanStreak: number };
export type NameProgress = Partial<Record<NameId, NameResult>>;
export const NAME_PROGRESS_KEY = "mira-name-progress-v1";

export function readNameProgress(): NameProgress {
  if (typeof window === "undefined") return {};
  try {
    const value = JSON.parse(window.localStorage.getItem(NAME_PROGRESS_KEY) || "{}");
    if (!value || typeof value !== "object") return {};
    const result: NameProgress = {};
    for (const card of NAME_CARDS) {
      const row = value[card.id];
      if (row && [row.rounds, row.perfect, row.errors, row.cleanStreak].every(n => Number.isSafeInteger(n) && n >= 0)) {
        result[card.id] = row;
      }
    }
    return result;
  } catch { return {}; }
}

export function recordNameResult(id: NameId, errors: number): NameProgress {
  const progress = readNameProgress();
  const prior = progress[id] || { rounds: 0, perfect: 0, errors: 0, cleanStreak: 0 };
  progress[id] = {
    rounds: prior.rounds + 1,
    perfect: prior.perfect + Number(errors === 0),
    errors: prior.errors + errors,
    cleanStreak: errors === 0 ? prior.cleanStreak + 1 : 0,
  };
  try { window.localStorage.setItem(NAME_PROGRESS_KEY, JSON.stringify(progress)); } catch { /* Game still works without storage. */ }
  return progress;
}

export function nameWeight(result?: NameResult): number {
  if (!result) return 2;
  const errorRate = result.errors / Math.max(1, result.rounds);
  return Math.max(0.3, (1 + Math.min(4, errorRate) * 2) / (1 + result.cleanStreak * 0.65));
}

export function chooseNameRound(progress: NameProgress, random = Math.random): NameCard[] {
  const remaining: NameCard[] = [...NAME_CARDS];
  const chosen: NameCard[] = [];
  while (chosen.length < ROUND_SIZE && remaining.length) {
    const weights = remaining.map(card => nameWeight(progress[card.id]));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let ticket = Math.min(Math.max(random(), 0), 0.999999999) * total;
    let index = weights.findIndex(weight => (ticket -= weight) < 0);
    if (index < 0) index = remaining.length - 1;
    chosen.push(remaining.splice(index, 1)[0]);
  }
  return chosen;
}
