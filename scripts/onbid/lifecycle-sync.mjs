// Marks Onbid conditions that dropped out of the latest complete list pass. Runs after each list
// refresh (collect.mjs) and can be run alone; it makes no Onbid API requests.
import {readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {writeJson} from './atomic.mjs';
import {trackMissing} from './lifecycle-core.mjs';
process.loadEnvFile('.env.local');
const root='data/onbid';
const read=async(name,fallback)=>{try{return JSON.parse(await readFile(`${root}/${name}`,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}};
const progress=await read('progress.json',{});
if(progress.status!=='list_completed')throw Error('LIST_NOT_COMPLETED');
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date(progress.listFinishedAt));
const listed=Object.keys(await read('targets.json',{}));
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const ids=new Map();
for(let offset=0;;offset+=1000){
 const {data,error}=await db.from('properties').select('id,source_property_id,auction_condition_id').eq('source','onbid').in('sido',['서울특별시','경기도']).order('id').range(offset,offset+999);
 if(error)throw Error(`DB_LOOKUP_${error.code}`);
 for(const r of data)ids.set(`${r.source_property_id}:${r.auction_condition_id}`,r.id);
 if(data.length<1000)break;
}
// A refresh that saw far fewer listings than the DB holds is more likely a partial pass than a mass closure.
if(listed.length<ids.size*0.8)throw Error(`LIST_TOO_SMALL_${listed.length}_OF_${ids.size}`);
const result=trackMissing(await read('missing.json',{}),[...ids.keys()],listed,day);
const checkedAt=new Date().toISOString(),source='https://www.onbid.co.kr/';
const rows=[
 ...result.recheck.map(key=>({property_id:ids.get(key),state:'needs-recheck',reason:'온비드 목록에서 미관측 · 하루 더 확인 후 종료 처리',checked_at:checkedAt,source_url:source,evidence:{missingDays:result.missing[key].days}})),
 ...result.closed.map(key=>({property_id:ids.get(key),state:'closed',reason:'온비드 목록에서 2일 연속 미관측 · 해당 입찰 조건 종료',checked_at:checkedAt,source_url:source,evidence:{missingDays:result.missing[key].days}})),
 ...result.restored.map(key=>({property_id:ids.get(key),state:'observed',reason:'온비드 목록 재관측',checked_at:checkedAt,source_url:source,evidence:{}})),
];
for(let i=0;i<rows.length;i+=500){const {error}=await db.from('property_lifecycle').upsert(rows.slice(i,i+500),{onConflict:'property_id'});if(error)throw Error(`DB_LIFECYCLE_${error.code}`);}
await writeJson(`${root}/missing.json`,result.missing);
const summary={day,listed:listed.length,db:ids.size,recheck:result.recheck.length,closed:result.closed.length,restored:result.restored.length};
progress.lifecycle=summary;await writeJson(`${root}/progress.json`,progress);
console.log(JSON.stringify(summary));
