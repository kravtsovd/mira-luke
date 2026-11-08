import { DEFAULT_FAMILY, getSession, sameOrigin } from "../../lib/auth";
import { NAME_CARDS } from "../../lib/huntrix";
import { ADDITION_STEPS, ADDITION_BASE_LIMITS, MIRA_SKILLS } from "../../lib/mira-learning";
import { LibraryBurstGuard } from "../../lib/library-auth";
const guard = new LibraryBurstGuard();
const headers = { "Cache-Control": "private, no-store" };
async function db(path: string, body?: object) {
 const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
 if (!key || !process.env.SUPABASE_URL) throw Error("unavailable");
 const r = await fetch(new URL("/rest/v1/"+path, process.env.SUPABASE_URL), { method:body?"POST":"GET",cache:"no-store",signal:AbortSignal.timeout(8000),headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined });
 if(!r.ok){const error=await r.json();throw Error(String(error.message).includes("stale level")?"stale":"unavailable");}return r.json();
}
export async function GET(request: Request) {
 if(getSession(request)?.familyId!==DEFAULT_FAMILY)return Response.json({error:"Недоступно"},{status:403,headers});
 try {return Response.json({skills:await db("mira_learning_progress?family_id=eq.demo&profile=eq.mira&select=skill,level,streak,attempts,correct,completed,updated_at")},{headers});}
 catch{return Response.json({error:"Прогресс пока недоступен"},{status:503,headers});}
}
export async function POST(request: Request) {
 if(!sameOrigin(request)||getSession(request)?.familyId!==DEFAULT_FAMILY)return Response.json({error:"Недоступно"},{status:403,headers});
 try {
 guard.check(request.headers.get("x-vercel-forwarded-for")??"local");
 const raw=await request.text();if(raw.length>1500)throw Error("invalid");const b=JSON.parse(raw);
 if(!MIRA_SKILLS.includes(b.skill)||!Number.isInteger(b.level)||b.level<1||b.level>(b.skill==="name-letters"?1:3)||typeof b.id!=="string"||! /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(b.id))throw Error("invalid");
 let correct=false;
 if(b.skill==="addition"||b.skill==="addition-quantity-v1") {

 if(!Number.isInteger(b.a)||b.a<1||b.a>(b.skill==="addition"?5:ADDITION_BASE_LIMITS[b.level-1])||!Number.isInteger(b.b)||b.b<1||b.b>ADDITION_STEPS[b.level-1]||!Number.isInteger(b.answer)||b.answer<1||b.answer>9)throw Error("invalid");
 correct=b.a+b.b===b.answer;
 }else{
 const card=NAME_CARDS.find(c=>c.id===b.card);if(!card||typeof b.word!=="string"||b.word.length>20)throw Error("invalid");
 correct=card.name.toUpperCase()===b.word;
 }
 const rows=await db("rpc/record_mira_learning",{fam:DEFAULT_FAMILY,attempt:b.id,skill_id:b.skill,expected_level:b.level,is_correct:correct});
 return Response.json({progress:rows[0],correct},{headers});
 }catch(error){return Response.json({error:"Не удалось сохранить. Повтори попытку.",code:error instanceof Error?error.message:"invalid"},{status:error instanceof Error&&error.message==="stale"?409:503,headers});}
}
