// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, cleanup } from '@testing-library/react';
import MiraLearningGame from '../app/components/MiraLearningGame';
import { speakRussian } from '../app/lib/speech';
import { voiceDelay } from '../app/lib/voice-timing';
import { advanceSkill, freshSkill } from '../app/lib/mira-learning';
vi.mock('../app/components/useGameAnalytics',()=>({default:()=>({answer:vi.fn(),complete:vi.fn()})}));
vi.mock('../app/lib/speech',()=>({speakRussian:vi.fn(),stopSpeaking:vi.fn()}));
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('requires a clean consecutive series and resets the same letter task after a mistake',async()=>{
 vi.useFakeTimers();vi.spyOn(Math,'random').mockReturnValue(0);
 const onComplete=vi.fn();
 let progress=freshSkill();
 vi.stubGlobal('fetch',vi.fn(async(_url,options)=>{
  if(!options?.method)return Response.json({skills:[]});
  const body=JSON.parse(options.body);const correct=body.word==='РУМИ';
  progress=advanceSkill(progress,correct,1);return Response.json({correct,progress});
 }));
 await act(async()=>{render(<MiraLearningGame skill="name-letters" soundEnabled={false} onComplete={onComplete}/>);});
 async function tap(c:string){await act(async()=>{fireEvent.click(screen.getAllByRole('button',{name:c})[0]);});}
 async function word(){for(const c of 'РУМИ')await tap(c);await act(async()=>{vi.advanceTimersByTime(1200);});}
 await word();await tap('И');await act(async()=>{vi.advanceTimersByTime(1200);});
 expect(screen.getByAltText('Лисёнок Руми')).toBeTruthy();
 for(const c of 'РУМИ')expect(screen.getByRole('button',{name:c})).toBeTruthy();
 await word();await word();expect(screen.queryByText('Отличная работа!')).toBeNull();
 expect(progress).toMatchObject({streak:2,completed:0});
 await word();expect(screen.getByText('Отличная работа!')).toBeTruthy();expect(progress.completed).toBe(1);
 expect(screen.queryByRole('button',{name:'Продолжить смотреть'})).toBeNull();expect(onComplete).toHaveBeenCalledOnce();
});

it('does not repeat adjacent sums when browser storage is blocked',async()=>{
 vi.useFakeTimers();vi.spyOn(Math,'random').mockReturnValue(0);
 vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('blocked')});
 vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('blocked')});
 let progress=freshSkill();
 vi.stubGlobal('fetch',vi.fn(async(_url,options)=>{
  if(!options?.method)return Response.json({skills:[]});
  progress=advanceSkill(progress,true);return Response.json({correct:true,progress});
 }));
 await act(async()=>{render(<MiraLearningGame skill="addition" soundEnabled={false} onComplete={()=>{}}/>);});
 const seen:string[]=[];
 for(let i=0;i<3;i++){
  const equation=screen.getByLabelText(/\d+ плюс \d+/).getAttribute('aria-label')!;
  expect(seen).not.toContain(equation);seen.push(equation);
  if(i<2){const numbers=equation.match(/\d+/g)!.map(Number);await act(async()=>{fireEvent.click(screen.getByRole('button',{name:String(numbers[0]+numbers[1])}));});await act(async()=>{vi.advanceTimersByTime(1200);});}
 }
});

it('starts the quantity version fresh even when legacy addition has level two',async()=>{
 vi.spyOn(Math,'random').mockReturnValue(0);localStorage.clear();
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({skills:[{skill:'addition',...freshSkill(),level:2,completed:1}]})));
 await act(async()=>{render(<MiraLearningGame skill="addition" soundEnabled={false} onComplete={()=>{}}/>);});
 expect(screen.getByText('Сложение · шаг 1 из 3')).toBeTruthy();
 const left=screen.getByTestId('left-number').closest('[data-quantity]')!;
 expect(left.getAttribute('data-grid')).toBe('2');expect(left.querySelectorAll('.mira-monster').length).toBe(Number(left.getAttribute('data-quantity')));
});
it('shows the matching picture count in square grids on operands and answer choices',async()=>{
 vi.spyOn(Math,'random').mockReturnValue(.999);localStorage.clear();
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({skills:[{skill:'addition-quantity-v1',...freshSkill(),level:3,completed:2}]})));
 const view=await act(async()=>render(<MiraLearningGame skill="addition" soundEnabled={false} onComplete={()=>{}}/>));
 const quantities=view.container.querySelectorAll('[data-quantity]');expect(quantities.length).toBe(5);
 for(const q of quantities){const value=Number(q.getAttribute('data-quantity'));expect(q.querySelectorAll('.mira-monster').length).toBe(value);expect(q.getAttribute('data-grid')).toBe(value<=4?'2':'3');}
});


it.each(['addition','name-letters'] as const)('keeps %s open until the series is complete',async skill=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({skills:[]})));
 const onComplete=vi.fn();
 await act(async()=>{render(<MiraLearningGame skill={skill} soundEnabled={false} onComplete={onComplete}/>);});
 expect(screen.queryByRole('button',{name:'Закрыть игру'})).toBeNull();
 expect(document.activeElement).toBe(screen.getByRole('heading',{level:1}));
 fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});
 expect(onComplete).not.toHaveBeenCalled();
 expect(screen.queryByRole('button',{name:'Продолжить смотреть'})).toBeNull();
});


it('keeps every quantity countable when artwork fails and restores images after retry',async()=>{
 vi.spyOn(Math,'random').mockReturnValue(0);
 const images:{onload:(()=>void)|null;onerror:(()=>void)|null;src:string}[]=[];
 vi.stubGlobal('Image',class {onload=null;onerror=null;src='';constructor(){images.push(this);}});
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({skills:[]})));
 const view=await act(async()=>render(<MiraLearningGame skill="addition" soundEnabled={false} onComplete={()=>{}}/>));
 await act(async()=>{images.at(-1)!.onerror?.();});
 for(const q of view.container.querySelectorAll('[data-quantity]'))expect(q.querySelectorAll('.mira-monster-fallback').length).toBe(Number(q.getAttribute('data-quantity')));
 expect(screen.getByText('Картинки не загрузились. Считаем дракончиков.')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Загрузить картинки'}));
 await act(async()=>{images.at(-1)!.onload?.();});
 expect(view.container.querySelectorAll('.mira-monster-fallback').length).toBe(0);
 expect(screen.queryByText('Картинки не загрузились. Считаем дракончиков.')).toBeNull();
 expect(view.container.querySelectorAll('.mira-monster').length).toBeGreaterThan(0);
});

it.each(['addition','name-letters'] as const)('plays %s without a family session and restores device progress',async skill=>{
 vi.useFakeTimers();vi.spyOn(Math,'random').mockReturnValue(0);localStorage.clear();
 const request=vi.fn(async()=>Response.json({error:'Недоступно'},{status:403}));vi.stubGlobal('fetch',request);
 const onSolved=vi.fn(),onComplete=vi.fn();
 const view=await act(async()=>render(<MiraLearningGame skill={skill} soundEnabled={false} onSolved={onSolved} onComplete={onComplete}/>));
 expect(screen.queryByText('Войти в семейный аккаунт')).toBeNull();
 expect(screen.getByText('Прогресс сохраняется на этом устройстве.')).toBeTruthy();
 async function answer(correct=true){
  if(skill==='addition'){
   const [a,b]=screen.getByLabelText(/\d+ плюс \d+/).getAttribute('aria-label')!.match(/\d+/g)!.map(Number);
   const choices=screen.getAllByRole('button');const button=choices.find(button=>{const value=Number(button.querySelector('[data-quantity]')?.getAttribute('data-quantity'));return correct?value===a+b:value!==a+b;})!;
   await act(async()=>{fireEvent.click(button);});
  }else{
   for(const c of correct?'РУМИ':'И')await act(async()=>{fireEvent.click(screen.getAllByRole('button',{name:c})[0]);});
  }
  await act(async()=>{vi.advanceTimersByTime(1200);});
 }
 await answer();await answer(false);
 expect(screen.getByText('Без ошибки подряд: 0 из 3')).toBeTruthy();
 for(let i=0;i<3;i++)await answer();
 expect(onSolved).toHaveBeenCalledOnce();expect(screen.getByText('Отличная работа!')).toBeTruthy();
 expect(screen.queryByRole('button',{name:'Продолжить смотреть'})).toBeNull();expect(onComplete).toHaveBeenCalledOnce();
 expect(request).toHaveBeenCalledTimes(1);
 view.unmount();
 await act(async()=>{render(<MiraLearningGame skill={skill} soundEnabled={false} onComplete={()=>{}}/>);});
 expect(screen.getByText(skill==='addition'?'Сложение · шаг 2 из 3':'Три имени подряд без ошибки - цель упражнения.')).toBeTruthy();
 const stored=JSON.parse(localStorage.getItem(`mira-practice-${skill==='addition'?'addition-quantity-v1':skill}`)!);
 expect(stored).toMatchObject({attempts:5,correct:4,completed:1});
});

it('keeps family server failures retryable without switching to device practice',async()=>{
 localStorage.clear();const request=vi.fn(async()=>Response.json({error:'unavailable'},{status:503}));vi.stubGlobal('fetch',request);
 await act(async()=>{render(<MiraLearningGame skill="addition" soundEnabled={false} onComplete={()=>{}}/>);});
 expect(screen.getByText('Не удалось загрузить прогресс. Нажми «Повторить».')).toBeTruthy();
 expect(screen.queryByText('Прогресс сохраняется на этом устройстве.')).toBeNull();
});

it.each(['addition','name-letters'] as const)('speaks explicit error feedback and completes %s automatically',async skill=>{
 vi.useFakeTimers();vi.spyOn(Math,'random').mockReturnValue(0);localStorage.clear();
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:'guest'},{status:403})));
 const onSolved=vi.fn(),onComplete=vi.fn();
 await act(async()=>{render(<MiraLearningGame skill={skill} soundEnabled onSolved={onSolved} onComplete={onComplete}/>);});
 async function answer(correct:boolean){
  if(skill==='addition'){
   const [a,b]=screen.getByLabelText(/\d+ плюс \d+/).getAttribute('aria-label')!.match(/\d+/g)!.map(Number);
   const button=screen.getAllByRole('button').find(button=>{const value=Number(button.querySelector('[data-quantity]')?.getAttribute('data-quantity'));return correct?value===a+b:value!==a+b;})!;
   await act(async()=>{fireEvent.click(button);});
  }else for(const c of correct?'РУМИ':'И')await act(async()=>{fireEvent.click(screen.getAllByRole('button',{name:c})[0]);});
 }
 await answer(false);
 expect(speakRussian).toHaveBeenLastCalledWith('Неправильно. Попробуй ещё раз.',true);
 expect(onSolved).not.toHaveBeenCalled();expect(onComplete).not.toHaveBeenCalled();
 await act(async()=>{vi.advanceTimersByTime(voiceDelay('Неправильно. Попробуй ещё раз.',true,1100));});
 for(let i=0;i<3;i++){
  await answer(true);
  expect(onComplete).not.toHaveBeenCalled();
  if(i<2)await act(async()=>{vi.advanceTimersByTime(voiceDelay('Верно! Молодец!',true,1100));});
 }
 expect(onSolved).toHaveBeenCalledOnce();
 expect(screen.queryByRole('button',{name:'Продолжить смотреть'})).toBeNull();
 await act(async()=>{vi.advanceTimersByTime(voiceDelay('Верно! Молодец!',true,1100));});
 expect(onComplete).toHaveBeenCalledOnce();
});
