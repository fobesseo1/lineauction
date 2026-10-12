// 사용승인 연도 for current properties from the building register (건축HUB 표제부) by PNU.
//   node scripts/building-year.mjs [--limit N]
// 빌라 first (their comparison filters on build year), then everything else with a PNU.
// Each PNU is looked up once and cached in data/building/years.json (null = no register entry).
import {mkdir,readFile,access} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {writeJson} from './onbid/atomic.mjs';
import {singleRun} from './single-run.mjs';
import {VILLA_USES} from './molit/match.mjs';
process.loadEnvFile('.env.local');

const limitArg=process.argv.indexOf('--limit');const limit=limitArg>0?Number(process.argv[limitArg+1]):3000;
const root='data/building';await mkdir(root,{recursive:true});
if(!await singleRun(root,'scripts/building-year.mjs')){console.log('ALREADY_RUNNING');process.exit(0);}
const cachePath=`${root}/years.json`;
let cache={};try{cache=JSON.parse(await readFile(cachePath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

const props=[];
for(let from=0;;from+=1000){
 const {data,error}=await db.from('properties').select('id,usage_type,pnu,build_year').eq('is_current',true).not('pnu','is',null).order('id').range(from,from+999);
 if(error)throw Error(error.message);props.push(...data);if(data.length<1000)break;
}
const todo=[...new Set(props.filter(p=>!(p.pnu in cache)).sort((a,b)=>Number(VILLA_USES.test(b.usage_type))-Number(VILLA_USES.test(a.usage_type))).map(p=>p.pnu))];

// Latest 사용승인일 among the lot's main buildings (주건축물); attached buildings are ignored.
async function lookup(pnu){
 const url=new URL('https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo');
 for(const [k,v] of Object.entries({serviceKey:process.env.MOLIT_API_KEY,sigunguCd:pnu.slice(0,5),bjdongCd:pnu.slice(5,10),platGbCd:pnu[10]==='2'?'1':'0',bun:pnu.slice(11,15),ji:pnu.slice(15,19),numOfRows:'50',pageNo:'1',_type:'json'}))url.searchParams.set(k,v);
 for(let attempt=0;;attempt++){
  await sleep(700);
  try{
   const text=await (await fetch(url,{signal:AbortSignal.timeout(20000)})).text();
   const body=JSON.parse(text);
   const gateway=body.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnReasonCode;
   if(gateway){if(['22','30'].includes(String(gateway)))throw Error(`API_${gateway}`);if(attempt<3){await sleep(5000*(attempt+1));continue;}throw Error(`API_${gateway}`);}
   const items=[].concat(body.response?.body?.items?.item??[]);
   const years=items.filter(i=>i.mainAtchGbCd==='0'||i.mainAtchGbCdNm==='주건축물').map(i=>Number(String(i.useAprDay??'').slice(0,4))).filter(y=>y>1900&&y<=2100);
   return years.length?Math.max(...years):null;
  }catch(e){
   if(/^API_(22|30)$/.test(e.message))throw e;
   if(attempt<3){await sleep(5000*(attempt+1));continue;}
   return undefined;   // give up for today; not cached
  }
 }
}

let fetched=0,stopped=null;
for(const pnu of todo){
 if(fetched>=limit)break;
 if(await access(`${root}/STOP`).then(()=>true,()=>false)){stopped='STOP_PRESENT';break;}
 try{const y=await lookup(pnu);if(y!==undefined){cache[pnu]=y;fetched++;}}
 catch(e){stopped=e.message;break;}
 if(fetched%200===0)await writeJson(cachePath,cache);
}
await writeJson(cachePath,cache);

// Write years back to every current property whose PNU is now known.
const updates=props.filter(p=>cache[p.pnu]&&p.build_year!==cache[p.pnu]);
for(let i=0;i<updates.length;i+=20){
 await Promise.all(updates.slice(i,i+20).map(async p=>{const {error}=await db.from('properties').update({build_year:cache[p.pnu]}).eq('id',p.id);if(error)throw Error(error.message);}));
}
console.log(`DONE looked up ${fetched} (remaining ${Math.max(0,todo.length-fetched)})${stopped?` stopped: ${stopped}`:''}; properties updated ${updates.length}`);
