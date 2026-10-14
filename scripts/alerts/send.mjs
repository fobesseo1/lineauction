// Member alerts: lineestate's saved conditions (app.alert_rules) and watched properties
// (app.watchlist) → Telegram, after each Onbid / court / market run.
//   node scripts/alerts/send.mjs [--dry-run]
// State in data/alerts/state.json remembers what was already sent. The very first run, and the
// first sight of a new rule, only records the current matches so nobody gets a flood of old items.
import {mkdir,readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {writeJson} from '../onbid/atomic.mjs';
import {singleRun} from '../single-run.mjs';
import {SITE,isOpen,matchesRule,ruleKey,snapshot,watchChanges,itemLine,message} from './core.mjs';
import {sendMessage} from './telegram.mjs';
process.loadEnvFile('.env.local');

const dry=process.argv.includes('--dry-run');
const root='data/alerts';await mkdir(root,{recursive:true});
if(!await singleRun(root,'scripts/alerts/send.mjs')){console.log('ALREADY_RUNNING');process.exit(0);}
const statePath=`${root}/state.json`;
let state=null;try{state=JSON.parse(await readFile(statePath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const firstRun=!state;
state??={rules:{},sent:{},watch:{}};
const supa=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const app=supa.schema('app');
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());
const now=new Date().toISOString();
const must=({data,error})=>{if(error)throw Error(error.message);return data;};

const COLS='id,source,source_property_id,section,sido,sigungu,dong,address,usage_type,minimum_bid_price,appraisal_price,failed_bid_count,sale_date,bid_end_at,last_result,is_current,property_analysis(discount_rate,confidence,market_price_method)';
const analysisOf=p=>[].concat(p.property_analysis??[])[0]??null;
async function pages(query){const out=[];for(let from=0;;from+=1000){const rows=must(await query().range(from,from+999));out.push(...rows);if(rows.length<1000)return out;}}

const rules=must(await app.from('alert_rules').select('*').eq('enabled',true));
const watches=must(await app.from('watchlist').select('user_id,property_id').eq('notify_price_change',true));
const chats=new Map(must(await app.from('notification_channels').select('user_id,telegram_chat_id').not('telegram_chat_id','is',null)).map(c=>[c.user_id,c.telegram_chat_id]));
// Staff alerts without a site account: data/alerts/staff.json = [{name, chat_id, rules:[{name, sido:[…], min_discount_rate, …}]}]
// (same fields as app.alert_rules). Chat ids come from data/alerts/bot/seen.json after they press START.
let staff=[];try{staff=JSON.parse(await readFile(`${root}/staff.json`,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
for(const s of staff){
 const user=`staff:${s.chat_id}`;chats.set(user,s.chat_id);
 (s.rules??[]).forEach((r,i)=>rules.push({...r,id:`staff:${s.chat_id}:${i}`,user_id:user,name:r.name??s.name}));
}

const outbox=new Map(); // user_id → [{heading, lines, link}]
const queue=(user,heading,lines,link)=>{if(!lines.length)return;if(!outbox.has(user))outbox.set(user,[]);outbox.get(user).push({heading,lines,link});};
const pendingKeys=new Map(); // user_id → state updates applied once that user's messages went out

// ---- Saved conditions: new matches since the last run.
const stats={rules:rules.length,watches:watches.length,linked:chats.size,matches:0,newMatches:0,sent:0,failed:0};
if(rules.length){
 const current=(await pages(()=>supa.from('properties').select(COLS).eq('is_current',true).order('id'))).filter(p=>isOpen(p,today));
 for(const rule of rules){
  const hits=current.filter(p=>matchesRule(rule,p,analysisOf(p)));
  stats.matches+=hits.length;
  const fresh=hits.filter(p=>!state.sent[ruleKey(rule,p)]);
  const seen=Object.fromEntries(fresh.map(p=>[ruleKey(rule,p),now]));
  if(firstRun||!state.rules[rule.id]){
   // Start quietly; a newly saved rule gets one summary line instead of every current match.
   if(!firstRun)queue(rule.user_id,`알림 시작: ${rule.name??'조건'}`,[`지금 조건에 맞는 물건 ${hits.length}건. 앞으로 새로 맞는 물건이 생기면 알려드립니다.\n  ${SITE}/me/alerts`],`${SITE}/me/alerts`);
   Object.assign(state.sent,seen);state.rules[rule.id]=now;continue;
  }
  stats.newMatches+=fresh.length;
  queue(rule.user_id,`새 물건 ${fresh.length}건 · ${rule.name??'조건'}`,fresh.map(p=>itemLine(p,analysisOf(p))),`${SITE}/me/alerts`);
  pendingKeys.set(rule.user_id,{...(pendingKeys.get(rule.user_id)??{}),...seen});
 }
}

// ---- Watched properties: price, 유찰 or result changes. A past Onbid round follows its current round.
if(watches.length){
 const ids=[...new Set(watches.map(w=>w.property_id))];
 const watched=[];for(let i=0;i<ids.length;i+=200)watched.push(...must(await supa.from('properties').select(COLS).in('id',ids.slice(i,i+200))));
 const byId=new Map(watched.map(p=>[p.id,p]));
 const pastKeys=watched.filter(p=>!p.is_current&&p.source_property_id).map(p=>p.source_property_id);
 const currentBySource=new Map();
 for(let i=0;i<pastKeys.length;i+=200)for(const p of must(await supa.from('properties').select(COLS).eq('is_current',true).in('source_property_id',pastKeys.slice(i,i+200))))currentBySource.set(`${p.source}:${p.source_property_id}`,p);
 const changes=new Map();
 for(const w of watches){
  const base=byId.get(w.property_id);if(!base)continue;
  const p=base.is_current?base:currentBySource.get(`${base.source}:${base.source_property_id}`)??base;
  const key=`${w.user_id}:${w.property_id}`,snap=snapshot(p);
  const diff=watchChanges(state.watch[key],snap);
  if(diff.length){if(!changes.has(w.user_id))changes.set(w.user_id,[]);changes.get(w.user_id).push(itemLine(p,analysisOf(p),diff));}
  // Record now: a change is reported once even if the user has no Telegram linked yet.
  state.watch[key]=snap;
 }
 for(const [user,lines] of changes)queue(user,`관심 물건 변동 ${lines.length}건`,lines,`${SITE}/me`);
}

// ---- Send. Users without a linked chat are skipped but their state still advances.
for(const [user,messages] of outbox){
 const chat=chats.get(user);
 let ok=true;
 if(chat&&!dry){
  for(const m of messages){
   const r=await sendMessage(chat,message(m.heading,m.lines,m.link));
   if(r.ok)stats.sent++;else{stats.failed++;ok=false;console.error(`send ${user}: ${r.description}`);}
  }
 }
 if(ok)Object.assign(state.sent,pendingKeys.get(user)??{});
}
for(const [user,keys] of pendingKeys)if(!outbox.has(user))Object.assign(state.sent,keys);

// Forget sent keys after 120 days, and rules or watches that no longer exist.
const cutoff=new Date(Date.now()-120*86400e3).toISOString();
for(const [k,at] of Object.entries(state.sent))if(at<cutoff)delete state.sent[k];
const ruleIds=new Set(rules.map(r=>r.id));for(const id of Object.keys(state.rules))if(!ruleIds.has(id))delete state.rules[id];
const watchKeys=new Set(watches.map(w=>`${w.user_id}:${w.property_id}`));for(const k of Object.keys(state.watch))if(!watchKeys.has(k))delete state.watch[k];
if(!dry)await writeJson(statePath,state);
console.log(JSON.stringify({...stats,firstRun,dry}));
