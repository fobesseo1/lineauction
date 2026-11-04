// Several PCs, one worker: the daily runner claims (job, day) in Supabase before it starts
// (public.factory_claim_job), heartbeats while it runs and records how it ended. Also the operator
// Telegram notices: takeovers, missed jobs and the daily "who did what" report.
import {hostname} from 'node:os';
import {createClient} from '@supabase/supabase-js';
import {sendMessage} from '../alerts/telegram.mjs';
import {SCHEDULE_HOURS,runsOn,kstMinutes,koreanDay} from './core.mjs';

process.loadEnvFile('.env.local');
export const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
export const machineName=arg=>arg??process.env.FACTORY_MACHINE??hostname();
// Heartbeats every minute keep the lease; a PC that is off or frozen loses it after this long.
export const LEASE_SECONDS=Number(process.env.FACTORY_LEASE_SECONDS??900);
const LABELS={market:'단지·실거래',onbid:'온비드 공매',court:'법원 경매'};
const esc=s=>String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'})[c]);

export async function notifyOperator(text){
 const chat=process.env.TELEGRAM_CHAT_ID;if(!chat||!process.env.TELEGRAM_BOT_TOKEN)return {ok:false,description:'no operator chat'};
 // A trial run on a made-up day (FACTORY_DAY) says so, so it is not mistaken for a real one.
 const r=await sendMessage(chat,process.env.FACTORY_DAY?`[시험 ${process.env.FACTORY_DAY}] ${text}`:text);if(!r.ok)console.error('telegram failed',r.description);return r;
}
// Sent at most once per key across all PCs.
async function once(key,machine,text){
 const {data,error}=await db.from('factory_notices').insert({key,machine}).select('key');
 if(error){if(error.code==='23505')return false;throw Error(`notice: ${error.message}`);}
 if(data?.length)await notifyOperator(text);return true;
}

export function lease({job,day,machine}){
 const state={lost:false,timer:null};
 const rpc=async(name,args)=>{const {data,error}=await db.rpc(name,args);if(error)throw Error(`${name}: ${error.message}`);return data;};
 return {
  state,
  claim:force=>rpc('factory_claim_job',{p_job:job,p_day:day,p_machine:machine,p_lease_seconds:LEASE_SECONDS,p_force:!!force}),
  start(){
   state.timer=setInterval(async()=>{
    try{if(!await rpc('factory_heartbeat',{p_job:job,p_day:day,p_machine:machine,p_lease_seconds:LEASE_SECONDS}))state.lost=true;}
    catch(e){console.error('heartbeat failed',e.message);}   // a network blip; the lease lasts LEASE_SECONDS
   },Math.min(60_000,LEASE_SECONDS*1000/3));state.timer.unref();
  },
  stop(){clearInterval(state.timer);},
  finish:(status,summary,version)=>rpc('factory_finish_job',{p_job:job,p_day:day,p_machine:machine,p_status:status,p_summary:summary,p_bundle_version:version}),
 };
}

export const noticeTakeover=({job,day,machine,claim})=>once(`claim:${job}:${day}:${claim.attempt}`,machine,
 `<b>🔁 ${esc(LABELS[job]??job)}: ${esc(machine)}가 이어받음</b>\n${esc(claim.previous)}의 실행이 ${claim.reason==='retry'?'실패로 끝나':'시간 안에 끝나지 않아'} ${esc(machine)}가 다시 시작합니다 (${claim.attempt}번째 시도).`);
export const noticeStale=({job,day,machine,reason})=>once(`stale:${job}:${day}:${machine}`,machine,
 `<b>⚠️ ${esc(LABELS[job]??job)}: ${esc(machine)}의 수집 기록이 최신이 아님</b>\n${esc(reason)}\n수집은 했지만 지우는 단계(실거래 업로드·종료 처리·현재 목록 갱신·DB 반영·알림)는 건너뛰었고, 기록도 올리지 않았습니다. 다른 컴퓨터가 다시 시도할 수 있게 실패로 남깁니다.`);

// Latest acceptable finish (KST) per job; after it, a job nobody finished is reported once.
const DEADLINE={market:12*60,onbid:14*60,court:20*60};
const minutes=(a,b)=>a&&b?Math.round((Date.parse(b)-Date.parse(a))/60000):null;
const STATUS={completed:'완료',failed:'실패',running:'실행 중'};
export async function dailyNotices({day=koreanDay(),machine,now=new Date()}={}){
 const jobs=Object.keys(SCHEDULE_HOURS).filter(j=>runsOn(j,now)).sort((a,b)=>SCHEDULE_HOURS[a]-SCHEDULE_HOURS[b]);
 const {data:rows,error}=await db.from('factory_job_leases').select('*').eq('day',day);if(error)throw Error(error.message);
 const by=Object.fromEntries(rows.map(r=>[r.job,r]));
 const sent=[];
 for(const job of jobs){
  const r=by[job];
  if(kstMinutes(now)>=DEADLINE[job]&&!(r&&(r.status==='completed'||(r.status==='running'&&Date.parse(r.lease_until)>now.getTime()))))
   if(await once(`missed:${job}:${day}`,machine,`<b>⏰ ${esc(LABELS[job])}: ${Math.floor(DEADLINE[job]/60)}시까지 아무 컴퓨터도 끝내지 못함</b>\n${r?`마지막: ${esc(r.machine)} · ${STATUS[r.status]??r.status}${r.status==='running'?' (응답 없음)':''}`:'오늘 시작한 컴퓨터가 없습니다.'}\n켜져 있는 컴퓨터에서 바로가기로 직접 실행할 수 있습니다.`))sent.push(`missed:${job}`);
 }
 const finished=jobs.every(j=>by[j]&&by[j].status!=='running');
 if(jobs.length&&(finished||kstMinutes(now)>=21*60)){
  const lines=jobs.map(j=>{const r=by[j];if(!r)return `• ${LABELS[j]}: 안 함`;
   const took=minutes(r.started_at,r.finished_at);
   return `• ${LABELS[j]}: <b>${esc(r.machine)}</b> · ${STATUS[r.status]??r.status}${took!=null?` · ${took}분`:''}${r.attempt>1?` · ${r.attempt}번째 시도${r.previous_machine?` (앞: ${esc(r.previous_machine)})`:''}`:''}\n  판 ${esc(r.bundle_version??'—')}`;});
  if(await once(`report:${day}`,machine,`<b>📋 ${esc(day)} 데이터 공장</b>\n\n${lines.join('\n')}`))sent.push('report');
 }
 return sent;
}
