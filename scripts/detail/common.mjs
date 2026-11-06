// Shared plumbing for the complex-detail collectors: config, DB, stop signals.
import {readFileSync} from 'node:fs';
import {access,appendFile,mkdir,readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {regionCatalog} from '../court/regions.mjs';
import {leafRegions} from '../molit/core.mjs';
process.loadEnvFile('.env.local');

export const REGIONS=JSON.parse(readFileSync(new URL('./regions.json',import.meta.url),'utf8')).sido;
export const SIDO_NAMES=REGIONS.map(r=>r.name);
export const inRegion=name=>SIDO_NAMES.some(s=>(name??'').startsWith(s));
// Leaf 시군구 of the configured 시도 (cities with 구 are split into their 구).
export const leafSigungu=()=>{
 const names=Object.keys(regionCatalog.codes).filter(n=>inRegion(n));
 return names.filter(n=>!names.some(o=>o.startsWith(`${n} `))).map(n=>({name:n,code:regionCatalog.codes[n],sido:REGIONS.find(r=>n.startsWith(r.name))})).filter(r=>/^\d{5}$/.test(r.code));
};
export {leafRegions};

export const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i>0?process.argv[i+1]:fallback;};
export const flag=name=>process.argv.includes(name);
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export const kstDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());
export const exists=p=>access(p).then(()=>true,()=>false);
export const readJson=async(p,fallback)=>{try{return JSON.parse(await readFile(p,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}};
export const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});

// --until HH:MM (KST): the next time that clock reads HH:MM. Collectors stop by themselves then, so a long
// first load ends before the morning jobs start and picks up later from its cache.
export function untilFromArg(){
 const v=arg('--until',null);if(!v)return Infinity;
 const m=v.match(/^(\d{1,2}):(\d{2})$/);if(!m)throw Error('INVALID_UNTIL');
 const nowKst=Date.now()+9*3600e3,day=Math.floor(nowKst/86400e3)*86400e3;
 let t=day+(Number(m[1])*60+Number(m[2]))*60e3;if(t<=nowKst)t+=86400e3;
 return t-9*3600e3;
}
export async function dir(root,...subs){await mkdir(root,{recursive:true});for(const s of subs)await mkdir(`${root}/${s}`,{recursive:true});}
export const eventLog=root=>data=>appendFile(`${root}/events.jsonl`,JSON.stringify({at:new Date().toISOString(),...data})+'\n');

export async function fetchAll(table,columns,build=q=>q,orderBy='kapt_code'){
 const out=[];
 for(let from=0;;from+=1000){
  const {data,error}=await build(db.from(table).select(columns)).order(orderBy).range(from,from+999);
  if(error)throw Error(`${table}: ${error.message}`);
  out.push(...data);if(data.length<1000)break;
 }
 return out;
}
export const complexes=(columns='kapt_code,name,sido,latitude,longitude,pnu,households,management_area')=>fetchAll('complexes',columns,q=>q.in('sido',SIDO_NAMES));

export async function upsert(table,rows,onConflict,size=500){
 for(let i=0;i<rows.length;i+=size){
  for(let attempt=1;;attempt++){
   const {error}=await db.from(table).upsert(rows.slice(i,i+size),{onConflict});
   if(!error)break;
   if(attempt>=4)throw Error(`DB_${table}_${error.code}:${error.message}`);
   await sleep(5000*attempt);
  }
 }
}
// Upsert `rows`, then delete what they no longer contain. A much smaller answer means a bad source,
// so anything that would remove over 30% of the table stops first.
export async function replaceRows(table,rows,keyColumns,columnsForKey=keyColumns,guard=0.3){
 const key=r=>keyColumns.map(k=>r[k]).join('|');
 const current=await fetchAll(table,columnsForKey.join(','),q=>q,keyColumns[0]);
 const next=new Set(rows.map(key));
 const gone=current.filter(r=>!next.has(key(r)));
 if(current.length>100&&gone.length/current.length>guard)throw Error(`DELETE_GUARD:${table}:${gone.length}/${current.length}`);
 await upsert(table,rows,keyColumns.join(','));
 for(const r of gone){
  let q=db.from(table).delete();
  for(const k of keyColumns)q=q.eq(k,r[k]);
  const {error}=await q;
  if(error)throw Error(`DB_${table}_${error.code}:${error.message}`);
 }
 return {written:rows.length,removed:gone.length};
}
