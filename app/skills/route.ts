import template from "../lib/skill-atlas-template";
import { GET as readProgress } from "../api/mira-learning/route";
import { getSession, DEFAULT_FAMILY } from "../lib/auth";
export async function GET(request:Request){
 if(getSession(request)?.familyId!==DEFAULT_FAMILY)return new Response('<p>Войдите в семейный аккаунт.</p><a href="/api/auth/google?return=%2Fskills">Войти</a>',{status:401,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"private, no-store"}});
 const response=await readProgress(request);if(!response.ok)return new Response('Не удалось загрузить прогресс. Обновите страницу.',{status:503});
 const {skills}=await response.json();const now=new Date().toISOString();
 const data=JSON.stringify({rounds:[],game_builds:[],learning_progress:skills,window_end:now,window_start:now,retrieved_at:now}).replace(/</g,"\\u003c");
 return new Response(template.replace('__MIRA_SKILL_DATA__',data),{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow"}});
}
