// Region health check after each market run (lineestate docs/metro-expansion-plan.md, 2026-11-18).
// Fails (exit 1) and tells the operator chat when an enabled region looks silently empty or the
// official 시군구 list no longer matches scripts/regions.json. See region-health-core.mjs for why.
//   node scripts/daily/region-health.mjs [--dry] [--no-vworld] [--months 6]
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {createClient} from '@supabase/supabase-js';
import {ENABLED_REGIONS,catalogOf,regionConfig,keepBjd} from '../regions.mjs';
import {leafRegions} from '../molit/core.mjs';
import {allFeatures} from '../geo/vworld.mjs';
import {sendMessage} from '../alerts/telegram.mjs';
import {quietTradeFindings,complexFindings,dongFindings,adminCodeFindings,healthMessage} from './region-health-core.mjs';
process.loadEnvFile('.env.local');

const args=process.argv.slice(2);
const dry=args.includes('--dry'),noVworld=args.includes('--no-vworld');
const months=args.includes('--months')?Number(args[args.indexOf('--months')+1]):6;
const supa=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});

const leavesByRegion=Object.fromEntries(ENABLED_REGIONS.map(r=>[r.code,leafRegions(catalogOf([r]).codes,[r.name])]));
const leaves=Object.values(leavesByRegion).flat();
const findings=[],warnings=[];

// 1. MOLIT: recent months per leaf from the warehouse's load records.
{
 const d=new Date(Date.now()+9*3600_000);d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-(months-1));
 const from=d.toISOString().slice(0,7).replace('-','');
 const db=new DatabaseSync('data/molit/warehouse.sqlite',{readOnly:true});
 const loads=db.prepare("select lawd,api,total from month_loads where ym>=? and api in ('aptSale','aptRent')").all(from);
 db.close();
 findings.push(...quietTradeFindings(leaves,loads,regionConfig.quietLeaves??{}));
}

// 2. K-APT complexes per 시도 (and none of a partial region outside its 시군구).
{
 const counts={},outside={};
 for(const r of ENABLED_REGIONS){
  const {count,error}=await supa.from('complexes').select('kapt_code',{count:'exact',head:true}).eq('sido',r.name).eq('section','apartment');
  if(error)throw Error(`complexes ${r.name}: ${error.message}`);
  counts[r.name]=count??0;
  if(r.partial){
   const rows=[];
   for(let from=0;;from+=1000){const {data,error:e}=await supa.from('complexes').select('kapt_code,bjd_code').eq('sido',r.name).range(from,from+999);if(e)throw Error(e.message);rows.push(...data);if(data.length<1000)break;}
   outside[r.name]=rows.filter(c=>!keepBjd(r.code,c.bjd_code)).length;
  }
 }
 findings.push(...complexFindings(ENABLED_REGIONS,counts,outside));
}

// 3. 법정동 table.
{
 const dongs=JSON.parse(await readFile('data/geo/dongs.json','utf8').catch(()=>'{}'));
 findings.push(...dongFindings(leaves,dongs.table));
}

// 4. Official 시군구 list (vworld). A failed lookup is a warning, not a failure: the API itself can be down.
if(!noVworld){
 try{
  const official=[];
  for(const r of ENABLED_REGIONS)for(const f of await allFeatures('LT_C_ADSIGG_INFO',{attrFilter:`sig_cd:like:${r.code}`,geometry:'false'}))
   official.push({code:f.properties.sig_cd,name:f.properties.full_nm||`${r.name} ${f.properties.sig_kor_nm}`});
  findings.push(...adminCodeFindings(ENABLED_REGIONS,leavesByRegion,official));
 }catch(e){warnings.push(`공식 시군구 목록 확인 못 함: ${e.message}`);}
}

const summary={leaves:leaves.length,findings:findings.length,kinds:Object.fromEntries([...new Set(findings.map(f=>f.kind))].map(k=>[k,findings.filter(f=>f.kind===k).length])),warnings};
if(findings.length){
 console.error(healthMessage(findings));
 if(!dry&&process.env.TELEGRAM_CHAT_ID&&process.env.TELEGRAM_BOT_TOKEN){
  const r=await sendMessage(process.env.TELEGRAM_CHAT_ID,`<b>지역 점검: 확인 필요 ${findings.length}건</b>\n${healthMessage(findings).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'})[c])}`);
  if(!r.ok)console.error('telegram failed',r.description);
 }
}
console.log(JSON.stringify(summary));
process.exit(findings.length?1:0);
