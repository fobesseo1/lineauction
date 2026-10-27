// 단지 × 전용면적 타입별 대표 공급면적·평형·세대수 → public.complex_area_types.
//   node scripts/complex/area-types.mjs [extract.tsv]
// Reads the TSV from scripts/complex/area-extract.mjs (run that monthly on the new 건축HUB 대용량 zip).
// A lot shared by several complexes can't be split between them, so those complexes get no rows; a complex
// whose own lot has no rows uses the rows matched to it by 도로명·건물명 instead.
import {createReadStream} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {createClient} from '@supabase/supabase-js';
import {EXTRACT_COLUMNS,addUnitRow,finishUnits,areaTypes} from './area-core.mjs';
process.loadEnvFile('.env.local');

const src=process.argv[2]??'data/area-types/expos.tsv';
const meta=JSON.parse(await readFile(`${src}.meta.json`,'utf8'));
if(!/^\d{4}-\d{2}$/.test(meta.source_month??''))throw Error('NO_SOURCE_MONTH in meta');
const supa=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

const complexes=[];
for(let from=0;;from+=1000){
 const {data,error}=await supa.from('complexes').select('id,kapt_code,pnu,households').order('id').range(from,from+999);
 if(error)throw Error(error.message);
 complexes.push(...data);if(data.length<1000)break;
}
const byPnu=new Map(),households=new Map(complexes.map(c=>[c.kapt_code,c.households]));
for(const c of complexes.filter(c=>c.pnu)){const list=byPnu.get(c.pnu)??[];list.push(c.kapt_code);byPnu.set(c.pnu,list);}

// Units are grouped by owner: 'pnu:<kapt>' for rows on the complex's own lot, 'alt:<kapt>' for rows matched
// by 도로명·건물명 (alt), which a complex uses only when its own lot has no rows at all.
const units=new Map(),lotHasRows=new Set(),owners=new Map();
const owner=key=>{let o=owners.get(key);if(!o)owners.set(key,o=key);return o;};  // one shared string per owner
const lines=createInterface({input:createReadStream(src),crlfDelay:Infinity});
let header=true;
for await(const line of lines){
 if(header){if(line!==EXTRACT_COLUMNS.join('\t'))throw Error('UNEXPECTED_HEADER');header=false;continue;}
 const f=line.split('\t');
 const r=Object.fromEntries(EXTRACT_COLUMNS.map((c,i)=>[c,f[i]]));r.area=Number(r.area);
 if(!r.alt){
  if(!lotHasRows.has(r.pnu))lotHasRows.add(owner(r.pnu));
  if(byPnu.get(r.pnu)?.length!==1)continue;
  r.pnu=owner(`pnu:${byPnu.get(r.pnu)[0]}`);
 }else{
  if(r.alt.includes(','))continue;
  r.pnu=owner(`alt:${r.alt}`);
 }
 addUnitRow(units,r);
}
const unitsByOwner=new Map();
for(const u of finishUnits(units)){let list=unitsByOwner.get(u.pnu);if(!list)unitsByOwner.set(u.pnu,list=[]);list.push(u);}
units.clear();

const out=[];let byLot=0,byMatch=0,matchRejected=0;
for(const c of complexes){
 let list=unitsByOwner.get(`pnu:${c.kapt_code}`),matched=false;
 if(!list&&!(c.pnu&&lotHasRows.has(c.pnu))){
  list=unitsByOwner.get(`alt:${c.kapt_code}`);matched=true;
  // A 도로명·건물명 match must account for roughly the complex's own 세대수, or it is someone else's building.
  const hh=households.get(c.kapt_code);
  if(list&&!(hh>0&&list.length>=hh*0.5&&list.length<=hh*1.5)){matchRejected++;list=null;}
 }
 if(!list)continue;
 const types=areaTypes(list);
 if(types.length)matched?byMatch++:byLot++;
 for(const t of types)out.push({kapt_code:c.kapt_code,...t,source_month:meta.source_month});
}
console.log(`complexes ${complexes.length}: by lot ${byLot}, by 도로명·건물명 ${byMatch} (rejected ${matchRejected}), shared-lot skipped ${[...byPnu.values()].filter(l=>l.length>1).flat().length}, rows ${out.length}`);

// Replace each covered complex's rows; drop rows of complexes that no longer produce any.
const existing=new Set();
for(let from=0;;from+=1000){
 const {data,error}=await supa.from('complex_area_types').select('kapt_code,exclusive_area').order('kapt_code').order('exclusive_area').range(from,from+999);
 if(error)throw Error(error.message);
 for(const r of data)existing.add(`${r.kapt_code}|${Number(r.exclusive_area)}`);
 if(data.length<1000)break;
}
const keep=new Set(out.map(r=>`${r.kapt_code}|${r.exclusive_area}`));
const stale=[...existing].filter(k=>!keep.has(k)).map(k=>k.split('|'));
for(let i=0;i<out.length;i+=500){
 for(let attempt=1;;attempt++){
  const {error}=await supa.from('complex_area_types').upsert(out.slice(i,i+500).map(r=>({...r,computed_at:new Date().toISOString()})),{onConflict:'kapt_code,exclusive_area'});
  if(!error)break;
  if(attempt>=3)throw Error(`DB_${error.code}:${error.message}`);
  await sleep(5000*attempt);
 }
}
for(const [kapt_code,exclusive_area] of stale){
 const {error}=await supa.from('complex_area_types').delete().eq('kapt_code',kapt_code).eq('exclusive_area',exclusive_area);
 if(error)throw Error(`DB_${error.code}:${error.message}`);
}
console.log(`upserted ${out.length}, deleted ${stale.length}`);
