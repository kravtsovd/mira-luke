"use client";
import { useEffect, useRef, useState } from "react";
import { NAME_CARDS } from "../lib/huntrix";
import { ADDITION_STEPS, additionTask, variedAdditionTask, additionChoices, type AdditionTask, advanceSkill, readPracticeProgress, savePracticeProgress, freshSkill, MIRA_LEARNING_VERSION, type MiraSkill, type SkillProgress } from "../lib/mira-learning";
import { speakRussian, stopSpeaking } from "../lib/speech";
import { voiceDelay } from "../lib/voice-timing";
import useGameAnalytics from "./useGameAnalytics";
import "./mira-learning.css";
type Props={skill:Exclude<MiraSkill,"addition-quantity-v1">;soundEnabled:boolean;onSolved?:()=>void;onComplete:()=>void};

function Quantity({value,monster,artReady,testId}:{value:number;monster:number;artReady:boolean;testId?:string}){
 const columns=value<=4?2:3;
 return <span className="mira-quantity" data-quantity={value} data-grid={columns}>
 <span className="mira-quantity-number" data-testid={testId}>{value}</span>
 <span className="mira-quantity-grid" aria-hidden="true" style={{gridTemplateColumns:`repeat(${columns},minmax(0,1fr))`}}>
 {Array.from({length:columns*columns},(_,i)=><span key={i} className={i<value?"mira-monster":"mira-empty-cell"} style={i<value?{...(!artReady?{backgroundImage:"none"}:monster>=10?{backgroundImage:`url(${NAME_CARDS[monster-10].image})`,backgroundSize:"cover"}:{}),backgroundPosition:monster>=10?"50% 50%":`${monster%5*25}% ${Math.floor(monster/5)*100}%`}:undefined}>{i<value&&!artReady&&<span className="mira-monster-fallback">🐲</span>}</span>)}
 </span></span>;
}
export default function MiraLearningGame({skill,soundEnabled,onSolved,onComplete}:Props){
 const progressSkill:MiraSkill=skill==="addition"?"addition-quantity-v1":skill;
 const [progress,setProgress]=useState<SkillProgress|null>(null),[task,setTask]=useState(()=>additionTask(1));
 const [practice,setPractice]=useState(false);
 const [card,setCard]=useState(0),[tiles,setTiles]=useState<string[]>([]),[word,setWord]=useState("");
 const [message,setMessage]=useState(""),[pending,setPending]=useState(false),[finished,setFinished]=useState(false),[solved,setSolved]=useState(0);
 const alive=useRef(true);
 const lock=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|null>(null),root=useRef<HTMLDivElement>(null),title=useRef<HTMLHeadingElement>(null);
 const retry=useRef<{answer?:number;word?:string;[key:string]:unknown}|null>(null);
 const [monster,setMonster]=useState(0);
 const [loadedArt,setLoadedArt]=useState(""),[failedArt,setFailedArt]=useState(""),[artRetry,setArtRetry]=useState(0);
 const artSource=monster>=10?NAME_CARDS[monster-10].image:"/games/mira-addition/monsters.svg";
 const artReady=loadedArt===artSource;

 useEffect(()=>{
 if(skill!=="addition")return;
 let active=true;const image=new Image();
 image.onload=()=>{if(active){setLoadedArt(artSource);setFailedArt("");}};
 image.onerror=()=>{if(active)setFailedArt(artSource);};
 image.src=artSource;
 return()=>{active=false;image.onload=null;image.onerror=null;};
 },[artSource,artRetry,skill]);
 const [choices,setChoices]=useState<number[]>([]);
 const taskHistory=useRef<AdditionTask[]|null>(null);
 function nextTask(level:number){
 let recent:AdditionTask[]=taskHistory.current??[];if(taskHistory.current===null)try{const saved=JSON.parse(localStorage.getItem("mira-addition-quantity-recent-v1")||"[]");if(Array.isArray(saved))recent=saved.filter(t=>t&&Number.isInteger(t.a)&&t.a>=1&&t.a<=5&&Number.isInteger(t.b)&&t.b>=1&&t.b<=4).slice(-40);}catch{}
 const next=variedAdditionTask(level,recent);setTask(next);setChoices(additionChoices(next.answer));
 taskHistory.current=[...recent,next].slice(-40);
 try{localStorage.setItem("mira-addition-quantity-recent-v1",JSON.stringify(taskHistory.current));}catch{}
 }
 const analytics=useGameAnalytics(skill==="addition"?"mira-addition":"huntrix-letters",{game_variant:MIRA_LEARNING_VERSION,skill_id:progressSkill,presentation:skill==="addition"?"number-and-quantity-v1":undefined,level:progress?.level??1});
 function newName(){const i=Math.floor(Math.random()*NAME_CARDS.length);setCard(i);setWord("");setTiles([...NAME_CARDS[i].name.toUpperCase()].sort(()=>Math.random()-.5));}
 async function load(){try{const r=await fetch("/api/mira-learning",{cache:"no-store"});if(!alive.current)return;const guest=r.status===403;if(!guest&&!r.ok)throw Error();const data=guest?null:await r.json();const p=guest?readPracticeProgress(progressSkill):data.skills.find((s:{skill:string})=>s.skill===progressSkill)??freshSkill();setPractice(guest);setProgress(p);setMonster(Math.floor(Math.random()*13));if(skill==="addition")nextTask(p.level);newName();setMessage("");}catch{if(alive.current)setMessage("Не удалось загрузить прогресс. Нажми «Повторить».");}}
 useEffect(()=>{if(progress&&!finished)speakRussian(skill==="addition"?"Сколько героев вместе?":"Собери имя из букв",soundEnabled);},[task,card,progress?.level,soundEnabled]);
 useEffect(()=>{alive.current=true;title.current?.focus();void load();return()=>{alive.current=false;if(timer.current)clearTimeout(timer.current);stopSpeaking();};},[]);
 async function submit(payload:{answer?:number;word?:string;[key:string]:unknown}){
 if(lock.current||!progress)return;lock.current=true;setPending(true);retry.current=payload;
 try{let data:{correct:boolean;progress:SkillProgress};if(practice){const correct=skill==="addition"?payload.answer===task.answer:payload.word===NAME_CARDS[card].name.toUpperCase();const next=advanceSkill(progress,correct,skill==="addition"?3:1);savePracticeProgress(progressSkill,next);data={correct,progress:next};}else{const r=await fetch("/api/mira-learning",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});if(!alive.current)return;if(r.status===409){retry.current=null;await load();setMessage("Ступень обновилась на другом устройстве. Продолжим!");setPending(false);lock.current=false;return;}if(!r.ok)throw Error();data=await r.json();}retry.current=null;setProgress(data.progress);
 analytics.answer(data.correct,skill==="addition"?"sum_choice":"letter_word",{...skill==="addition"?{left:task.a,right:task.b}:{card:NAME_CARDS[card].id},clean_streak:data.progress.streak,completed_steps:data.progress.completed});
 setMessage(data.correct?"Верно! Молодец!":"Неправильно. Попробуй ещё раз.");speakRussian(data.correct?"Верно! Молодец!":"Неправильно. Попробуй ещё раз.",soundEnabled);
 const n=data.correct?solved+1:0;setSolved(n);
 const completed=data.correct&&data.progress.streak===0;
 if(completed){setFinished(true);analytics.complete();onSolved?.();}
 timer.current=setTimeout(()=>{if(completed){onComplete();return;}else{if(data.correct){if(skill==="addition")nextTask(data.progress.level);newName();setMonster(Math.floor(Math.random()*13));}else{setWord("");setTiles([...NAME_CARDS[card].name.toUpperCase()].sort(()=>Math.random()-.5));}setMessage("");}setPending(false);lock.current=false;},voiceDelay(data.correct?"Верно! Молодец!":"Неправильно. Попробуй ещё раз.",soundEnabled,1100));
 }catch{if(!alive.current)return;setMessage("Не удалось сохранить. Нажми «Повторить».");setPending(false);lock.current=false;}
 }
 function chooseNumber(answer:number){void submit({id:crypto.randomUUID(),skill:progressSkill,level:progress?.level,a:task.a,b:task.b,answer});}
 function chooseLetter(letter:string,index:number){if(lock.current||!progress)return;
 speakRussian(letter.toLowerCase(),soundEnabled);
 const next=word+letter,expected=NAME_CARDS[card].name.toUpperCase();
 if(!expected.startsWith(next)){setWord("");void submit({id:crypto.randomUUID(),skill,level:1,card:NAME_CARDS[card].id,word:next});return;}
 setWord(next);setTiles(current=>current.map((t,i)=>i===index?"":t));
 if(next===expected)void submit({id:crypto.randomUUID(),skill,level:1,card:NAME_CARDS[card].id,word:next});
 }
 return <div className="mira-learning" ref={root} role="dialog" aria-modal="true" aria-label={skill==="addition"?"Складываем героев":"Собираем имя из букв"} onKeyDown={e=>{if(e.key==="Tab"){const buttons=Array.from(root.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")??[]);const first=buttons[0],last=buttons[buttons.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}>
 <section className="mira-learning-card"><header><span>{skill==="addition"?`Сложение · шаг ${progress?.level??1} из 3`:"Имя из букв"}</span></header>
 <h1 ref={title} tabIndex={-1} style={{outline:"none"}}>{finished?"Отличная работа!":skill==="addition"?"Сколько героев вместе?":"Собери имя из букв"}</h1>
 {practice&&<small>Прогресс сохраняется на этом устройстве.</small>}
 {progress&&<div className="mira-streak"><span>Без ошибки подряд: {progress.streak} из 3</span><progress max={3} value={progress.streak}/><small>{skill==="addition"?`Пройдено ступеней: ${progress.completed} из 3. Сейчас прибавляем от 1 до ${ADDITION_STEPS[progress.level-1]}.`:"Три имени подряд без ошибки - цель упражнения."}</small></div>}
 {!progress?<div><button onClick={()=>void load()}>Повторить</button><p><a href={"/api/auth/google?return="+encodeURIComponent(skill==="addition"?"/games/mira-addition":"/games/huntrix-letters")}>Войти в семейный аккаунт</a></p></div>:finished?<p role="status">Молодец!</p>:skill==="addition"?<><div className="mira-sum" aria-label={`${task.a} плюс ${task.b}`}><Quantity value={task.a} monster={monster} artReady={artReady} testId="left-number"/><b>+</b><Quantity value={task.b} monster={monster} artReady={artReady} testId="right-number"/><b>=</b><strong className="mira-digit mira-answer">?</strong></div><div className="mira-number-choices mira-picture-choices">{choices.map(answer=><button disabled={pending||!!retry.current} key={answer} onClick={()=>chooseNumber(answer)}><Quantity value={answer} monster={monster} artReady={artReady}/></button>)}</div></>:<><img className="mira-word-portrait" src={NAME_CARDS[card].image} alt={NAME_CARDS[card].description}/><div className="mira-letter-slots" aria-label="Собранные буквы">{[...NAME_CARDS[card].name].map((_,i)=><span key={i}>{word[i]||"·"}</span>)}</div><div className="mira-number-choices">{tiles.map((t,i)=><button key={i} disabled={!t||pending||!!retry.current} onClick={()=>chooseLetter(t,i)}>{t||"·"}</button>)}</div></>}
 {skill==="addition"&&!finished&&failedArt===artSource&&<div className="mira-art-retry"><small>Картинки не загрузились. Считаем дракончиков.</small><button type="button" onClick={()=>{setFailedArt("");setArtRetry(n=>n+1);}}>Загрузить картинки</button></div>}
 <p role="status">{message}</p>{retry.current&&<button disabled={pending} onClick={()=>void submit(retry.current!)}>Повторить</button>}
 <small>В этой серии верно: {solved} из 3</small></section></div>;
}
