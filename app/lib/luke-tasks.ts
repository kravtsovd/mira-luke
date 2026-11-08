// Session thr_qmx4fhydbe (a parent, 2026-10-08): every one of Luke's games used to ask for three things in a row, and
// three is one too many for him right now. Each game asks for exactly this many and then lets the cartoon go on.
// The boards keep their third option where it makes the answer a real choice (three garages for two cars, three
// groups of cars for two groups of boys), so the games get shorter, not easier.
export const LUKE_TASKS_PER_GAME = 2;

export function shuffleWith<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
