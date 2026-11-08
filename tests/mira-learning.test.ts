import { expect, it } from 'vitest';
import { additionTask, advanceSkill, freshSkill, variedAdditionTask, additionChoices, type AdditionTask } from '../app/lib/mira-learning';
it('unlocks only after three consecutive clean answers; mistakes reset just the current streak',()=>{
 let p=freshSkill();p=advanceSkill(p,true);p=advanceSkill(p,true);p=advanceSkill(p,false);
 expect(p).toMatchObject({level:1,streak:0,completed:0});
 for(let i=0;i<3;i++)p=advanceSkill(p,true);
 expect(p).toMatchObject({level:2,streak:0,completed:1});
 p=advanceSkill(p,false);expect(p.completed).toBe(1);
 for(let i=0;i<6;i++)p=advanceSkill(p,true);
 expect(p).toMatchObject({level:3,completed:3});
});
it('keeps base numbers within 1..5 and respects each addend limit',()=>{
 for(const level of [1,2,3])for(let i=0;i<100;i++){
 const t=additionTask(level,()=>i/100);expect(t.a).toBeGreaterThanOrEqual(1);expect(t.a).toBeLessThanOrEqual(5);
 expect(t.b).toBeGreaterThanOrEqual(1);expect(t.b).toBeLessThanOrEqual([1,2,4][level-1]);expect(t.answer).toBe(t.a+t.b);
 }
});

it('covers the available sums before repeating, even with constant randomness',()=>{
 for(const level of [1,2,3]){
 const n=[4,10,20][level-1];const recent:AdditionTask[]=[];
 for(let i=0;i<n;i++)recent.push(variedAdditionTask(level,recent,()=>0));
 expect(new Set(recent.map(t=>`${t.a}+${t.b}`)).size).toBe(n);
 const next=variedAdditionTask(level,recent,()=>0);expect([next.a,next.b]).not.toEqual([recent.at(-1)!.a,recent.at(-1)!.b]);
 }
});
it('always includes the correct result among three unique, shuffled valid choices',()=>{
 for(let answer=2;answer<=9;answer++)for(const random of [()=>0,()=>.999]){
 const options=additionChoices(answer,random);expect(new Set(options).size).toBe(3);expect(options).toContain(answer);
 expect(options.every(x=>x>=1&&x<=9)).toBe(true);
 }
 expect(additionChoices(6,()=>0)).not.toEqual(additionChoices(6,()=>.999));
});

it('starts with bases 1..4 plus one before opening larger addends',()=>{
 for(let i=0;i<100;i++){const t=additionTask(1,()=>i/100);expect(t.a).toBeLessThanOrEqual(4);expect(t.b).toBe(1);}
});
