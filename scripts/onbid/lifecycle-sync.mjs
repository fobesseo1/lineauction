// Marks Onbid conditions that dropped out of the latest complete list pass. Runs after each list
// refresh (collect.mjs) and can be run alone; it makes no Onbid API requests.
// --dry-run prints the counts without writing; --allow-large-delete passes the first-missing guard;
// --accept-size skips the list-size guard once (e.g. the first run, or after a long gap when the
// previous pass is unknown).
import {readFile} from 'node:fs/promises';
import {REGIONS} from './core.mjs';
import {createClient} from '@supabase/supabase-js';
import {writeJson} from './atomic.mjs';
import {trackMissing,previousListedCount} from './lifecycle-core.mjs';
import {APARTMENT_USE} from '../property-section.mjs';
import {guardDeletes} from '../daily/delete-guard.mjs';
process.loadEnvFile('.env.local');
const root=process.env.ONBID_ROOT??'data/onbid';
const read=async(name,fallback)=>{try{return JSON.parse(await readFile(`${root}/${name}`,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}};
const dryRun=process.argv.includes('--dry-run'),acceptSize=process.argv.includes('--accept-size');
const progress=await read('progress.json',{});
if(progress.status!=='list_completed')throw Error('LIST_NOT_COMPLETED');
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date(progress.listFinishedAt));
const listed=Object.keys(await read('targets.json',{}));
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const ids=new Map();
for(let offset=0;;offset+=1000){
 const {data,error}=await db.from('properties').select('id,source_property_id,auction_condition_id').eq('source','onbid').eq('usage_type',APARTMENT_USE).in('sido',REGIONS).order('id').range(offset,offset+999);
 if(error)throw Error(`DB_LOOKUP_${error.code}`);
 for(const r of data)ids.set(`${r.source_property_id}:${r.auction_condition_id}`,r.id);
 if(data.length<1000)break;
}
// A pass that saw far fewer listings than the previous one is more likely partial than a mass closure.
// (The DB keeps closed conditions, so its size is no baseline.)
const last=await read('lifecycle-state.json',null);
const previous=await read('missing.json',{});
// Only apartments are collected, so only apartments can go missing; other types are left as they are.
const previousListed=previousListedCount(last,[...ids.keys()],previous);
if(!acceptSize){
 if(!previousListed)throw Error('NO_PREVIOUS_PASS_RUN_WITH_--accept-size');
 if(listed.length<previousListed*0.8)throw Error(`LIST_TOO_SMALL_${listed.length}_OF_PREVIOUS_${previousListed}`);
}
const result=trackMissing(previous,[...ids.keys()],listed,day);
const newlyClosed=result.closed.filter(key=>(previous[key]?.days?.length??0)<2).length;
// Conditions missing for the first time; a normal day has up to ~9% of the list (2026-10-30: 2,279).
// An empty or stale missing.json makes every long-closed condition look newly missing.
const newlyMissing=result.recheck.filter(key=>!previous[key]).length;
if(dryRun){console.log(JSON.stringify({dryRun:true,day,listed:listed.length,previousListed,db:ids.size,recheck:result.recheck.length,newlyMissing,closed:result.closed.length,newlyClosed,restored:result.restored.length}));process.exit(0);}
await guardDeletes('온비드 종료 처리',[{name:'처음 목록에서 빠진 입찰 조건',removed:newlyMissing,total:previousListed??listed.length,ratio:0.15}]);
const checkedAt=new Date().toISOString(),source='https://www.onbid.co.kr/';
const rows=[
 ...result.recheck.map(key=>({property_id:ids.get(key),state:'needs-recheck',reason:'온비드 목록에서 미관측 · 하루 더 확인 후 종료 처리',checked_at:checkedAt,source_url:source,evidence:{missingDays:result.missing[key].days}})),
 ...result.closed.map(key=>({property_id:ids.get(key),state:'closed',reason:'온비드 목록에서 2일 연속 미관측 · 해당 입찰 조건 종료',checked_at:checkedAt,source_url:source,evidence:{missingDays:result.missing[key].days}})),
 ...result.restored.map(key=>({property_id:ids.get(key),state:'observed',reason:'온비드 목록 재관측',checked_at:checkedAt,source_url:source,evidence:{}})),
];
for(let i=0;i<rows.length;i+=500){const {error}=await db.from('property_lifecycle').upsert(rows.slice(i,i+500),{onConflict:'property_id'});if(error)throw Error(`DB_LIFECYCLE_${error.code}`);}
await writeJson(`${root}/missing.json`,result.missing);
await writeJson(`${root}/lifecycle-state.json`,{day,listed:listed.length,scope:'apartment'});
const summary={day,listed:listed.length,db:ids.size,recheck:result.recheck.length,closed:result.closed.length,newlyClosed,restored:result.restored.length};
progress.lifecycle=summary;await writeJson(`${root}/progress.json`,progress);
console.log(JSON.stringify(summary));
