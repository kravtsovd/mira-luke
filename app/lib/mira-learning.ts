export const MIRA_LEARNING_VERSION = "mira-learning-v1";
export const MIRA_SKILLS = ["addition", "addition-quantity-v1", "name-letters"] as const;
export type MiraSkill = typeof MIRA_SKILLS[number];
export type SkillProgress = { level: number; streak: number; attempts: number; correct: number; completed: number };
export const freshSkill = (): SkillProgress => ({ level: 1, streak: 0, attempts: 0, correct: 0, completed: 0 });
// Guest practice stays on this device and never writes to the family's progress.
export function readPracticeProgress(skill: MiraSkill): SkillProgress {
 try {
  const p = JSON.parse(localStorage.getItem(`mira-practice-${skill}`) || "null");
  const levels = skill === "name-letters" ? 1 : 3;
  if (p && [p.level, p.streak, p.attempts, p.correct, p.completed].every(n => Number.isSafeInteger(n) && n >= 0)
   && p.level >= 1 && p.level <= levels && p.streak < 3 && p.correct <= p.attempts && p.completed <= levels) return p;
 } catch { /* Practice also works when storage is blocked. */ }
 return freshSkill();
}
export function savePracticeProgress(skill: MiraSkill, progress: SkillProgress): void {
 try { localStorage.setItem(`mira-practice-${skill}`, JSON.stringify(progress)); } catch { /* Keep the in-memory progress. */ }
}
export const ADDITION_STEPS = [1, 2, 4] as const;
export const ADDITION_BASE_LIMITS = [4, 5, 5] as const;

export function advanceSkill(p: SkillProgress, correct: boolean, levels = 3): SkillProgress {
 const streak = correct ? p.streak + 1 : 0;
 const passed = streak >= 3;
 return { level: Math.min(levels, p.level + Number(passed)), streak: passed ? 0 : streak,
 attempts: p.attempts + 1, correct: p.correct + Number(correct), completed: Math.max(p.completed, passed ? p.level : 0) };
}
export function additionTask(level: number, random = Math.random) {
 const a = 1 + Math.floor(random() * ADDITION_BASE_LIMITS[Math.min(2, Math.max(0, level - 1))]), b = 1 + Math.floor(random() * ADDITION_STEPS[Math.min(2, Math.max(0, level - 1))]);
 return { a, b, answer: a + b };
}

export type AdditionTask = ReturnType<typeof additionTask>;

export function variedAdditionTask(level: number, recent: readonly AdditionTask[], random = Math.random): AdditionTask {
 const limit = ADDITION_STEPS[Math.min(2, Math.max(0, level - 1))];
 const all = Array.from({length:ADDITION_BASE_LIMITS[Math.min(2, Math.max(0, level - 1))]},(_,a)=>Array.from({length:limit},(_,b)=>({a:a+1,b:b+1,answer:a+b+2}))).flat();
 const count = (t:AdditionTask)=>recent.filter(r=>r.a===t.a&&r.b===t.b).length;
 const last=recent.at(-1);const candidates=all.filter(t=>!last||t.a!==last.a||t.b!==last.b);
 const minimum=Math.min(...candidates.map(count));let pool=candidates.filter(t=>count(t)===minimum);
 const differentBase=pool.filter(t=>t.a!==last?.a);if(differentBase.length)pool=differentBase;
 return pool[Math.min(pool.length-1,Math.max(0,Math.floor(random()*pool.length)))];
}
export function additionChoices(answer:number, random = Math.random): number[] {
 const start=Math.max(1,Math.min(7,answer-1));const options=[start,start+1,start+2];
 for(let i=options.length-1;i>0;i--){const j=Math.min(i,Math.max(0,Math.floor(random()*(i+1))));[options[i],options[j]]=[options[j],options[i]];}
 return options;
}
