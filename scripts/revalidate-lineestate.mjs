// Refresh lineestate's caches once the daily market job has refreshed the tables behind them (this
// runs after refresh_recommend_base). In a lineestate clone kept only for this job (never the working
// folder people edit in): git pull, then scripts/near-precompute.ts ranks every 역×평형 page into
// app.near_pages and clears the cache tag of only the pages whose content changed, then scripts/warm.mjs
// calls /api/revalidate and opens the sitemap's pages (~10k complexes, 4 at a time). Site URL, clone
// folder and secret live in .env.local.
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {createClient} from '@supabase/supabase-js';
import {loadEnv} from './daily/env.mjs';
loadEnv();
const site=process.env.LINEESTATE_SITE_URL,dir=process.env.LINEESTATE_DIR,secret=process.env.REVALIDATE_SECRET;
if(!site||!secret){console.error('LINEESTATE_SITE_URL or REVALIDATE_SECRET missing in .env.local');process.exit(1);}
const started=Date.now();
// Only the secret and public keys are passed, not the rest of .env.local. npx also needs the user
// folders for its cache. SUPABASE_SECRET_KEY (near_pages writes) is read by near-precompute.ts from
// the clone's own .env.local, so it is not passed from here.
const {NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}=process.env;
const pick=keys=>Object.fromEntries(keys.filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
// SUPABASE_GATE_TOKEN: the DB gate header for public-key reads (lineestate's x-ls-gate). Passed when set.
const env={...pick(['SystemRoot','PATH','APPDATA','LOCALAPPDATA','USERPROFILE','TEMP','TMP','SUPABASE_GATE_TOKEN']),REVALIDATE_SECRET:secret,NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY};
const tidy=r=>(r.stdout??'')+(r.stderr??'');
const linesOf=text=>text.split('\n').map(l=>l.trim()).filter(Boolean);

// 순위(랭킹) 원자료를 수도권·지방 둘로 먼저 만든다 (lineestate 요청 2026-11-26: 도까지 넣자 refresh_trade_ranking 한 번이
// service_role 제한 120초를 넘김). near-precompute.ts가 마지막에 부르는 refresh_trade_ranking()은 6시간 안의 원자료를
// 쓰므로 묶기만 한다(약 10초). 실패해도 계속한다: 그 함수가 혼자 다 만들려 하고, 결과는 '랭킹' 칸에 남는다.
const rankingSrc=[];
if(process.env.SUPABASE_SECRET_KEY){
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}});
 for(const part of ['capital','local']){
  const t=Date.now();const {error}=await db.schema('app').rpc('refresh_trade_ranking_src',{p_part:part});
  rankingSrc.push(`${part} ${error?`실패 ${error.code??''} ${error.message}`.slice(0,120):'ok'} ${Math.round((Date.now()-t)/1000)}초`);
 }
}else rankingSrc.push('건너뜀: SUPABASE_SECRET_KEY 없음');
let ranking='';
let pulled='skipped: LINEESTATE_DIR missing',near='skipped: LINEESTATE_DIR missing',nearCode=null,admin='skipped: LINEESTATE_DIR missing';
if(dir){
 // A failed pull (offline, local changes) still runs with the scripts already there.
 const pull=spawnSync('git',['pull','--ff-only'],{cwd:dir,encoding:'utf8',windowsHide:true,timeout:120_000});
 pulled=pull.status===0?'ok':`failed: ${(pull.stderr||pull.stdout||pull.error?.message||'').trim().split('\n').at(-1)}`;
 // npx through npm's own script next to node (no shell, no .cmd); the shell form only if it is not there.
 const npxCli=join(dirname(process.execPath),'node_modules','npm','bin','npx-cli.js');
 const args=['--yes','tsx','scripts/near-precompute.ts',site];
 const opts={cwd:dir,encoding:'utf8',windowsHide:true,timeout:20*60_000,env};
 const pre=existsSync(npxCli)?spawnSync(process.execPath,[npxCli,...args],opts):spawnSync('npx',args.map(a=>`"${a}"`),{...opts,shell:true});
 nearCode=pre.status;
 const lines=linesOf(tidy(pre)+(pre.error?`\n${pre.error.message}`:''));
 console.error(lines.join('\n'));
 // Exit 0 ok, 1 failed (rank, write or revalidate), 2 a missing env var (named in its 멈춤 line).
 const tail=lines.filter(l=>/^(계산 끝|표:|새로 만들기:|멈춤)/.test(l));
 ranking=lines.find(l=>/^랭킹:/.test(l))??'랭킹: 줄 없음';
 near=nearCode===0?tail.join(' / '):`code ${nearCode??'timeout'}: ${(tail.length?tail:lines.slice(-1)).join(' / ').slice(0,200)}`;
 // 관리자 대시보드 숫자 (lineestate 요청 19, 2026-11-19): ~30 s, reads its keys (GA_PROPERTY_ID, GA_KEY_FILE,
 // SUPABASE_SECRET_KEY) from the clone's .env.local. Exit 0 ok, 1 failed, 2 a missing env var. A failure is
 // only reported: it does not stop warm.mjs or fail this step. Before lineestate ships the script it is absent.
 if(!existsSync(join(dir,'scripts','admin-metrics.ts')))admin='skipped: scripts/admin-metrics.ts not in the clone yet';
 else{
  const aArgs=['--yes','tsx','scripts/admin-metrics.ts'];
  const aOpts={...opts,timeout:5*60_000};
  const am=existsSync(npxCli)?spawnSync(process.execPath,[npxCli,...aArgs],aOpts):spawnSync('npx',aArgs.map(a=>`"${a}"`),{...aOpts,shell:true});
  const aLines=linesOf(tidy(am)+(am.error?`\n${am.error.message}`:''));
  console.error(aLines.join('\n'));
  const done=aLines.filter(l=>/^끝:/.test(l)).at(-1);
  admin=am.status===0?(done??'ok'):`code ${am.status??'timeout'}: ${(aLines.filter(l=>/^(끝|멈춤)/.test(l)).at(-1)??aLines.at(-1)??'').slice(0,200)}`;
 }
}
const nearOk=nearCode===0;

// LINEESTATE_WARM=off skips warm.mjs (each warmed page is a Vercel ISR write; the monthly quota ran out
// in 2026-11) and only clears the caches: pages are rebuilt when someone opens them.
if(process.env.LINEESTATE_WARM==='off'){
 const res=await fetch(`${site.replace(/\/$/,'')}/api/revalidate`,{method:'POST',headers:{Authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(60_000)}).catch(e=>({ok:false,status:0,text:async()=>e.message}));
 const text=await res.text();
 let body;try{body=JSON.parse(text);}catch{body=text.slice(0,200);}
 if(!res.ok)console.error(`revalidate failed: HTTP ${res.status} ${text.slice(0,200)}`);
 console.log(JSON.stringify({pull:pulled,near,ranking:`${ranking} (원자료 ${rankingSrc.join(', ')})`,admin,warm:'off',revalidated:res.ok?body?.revalidated??body:`HTTP ${res.status}`,seconds:Math.round((Date.now()-started)/1000)}));
 process.exit(res.ok&&(nearOk||!dir)?0:1);
}
if(!dir){console.error('LINEESTATE_DIR missing in .env.local');process.exit(1);}
// No --og / --near: each drawn page or image is a Vercel ISR write, and the monthly quota ran out
// (2026-11). The near pages are refreshed by near-precompute.ts above, only where they changed.
// A near-precompute failure does not stop this: the pages compute in place when the table is missing or stale.
const warm=spawnSync(process.execPath,['scripts/warm.mjs',site,'--revalidate'],{cwd:dir,encoding:'utf8',windowsHide:true,timeout:60*60_000,env});
const lines=linesOf(tidy(warm));
console.error(lines.join('\n'));
console.log(JSON.stringify({pull:pulled,near,ranking:`${ranking} (원자료 ${rankingSrc.join(', ')})`,admin,code:warm.status,revalidate:lines.find(l=>l.startsWith('revalidate'))??null,warm:lines.filter(l=>/개 \d+초/.test(l)),seconds:Math.round((Date.now()-started)/1000)}));
process.exit(warm.status===0&&nearOk?0:1);
