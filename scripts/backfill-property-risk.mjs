// One-off: fill properties.risk_flags for existing rows. Collectors set it from now on.
//   node scripts/backfill-property-risk.mjs [backup-dir]
// Court: the 비고 text from the local DB backup (court payloads are no longer in the DB).
// Onbid: the detail notes kept in onbid_observations; rows without a detail stay null.
import {createReadStream} from 'node:fs';
import {createGunzip} from 'node:zlib';
import {createInterface} from 'node:readline';
import {createClient} from '@supabase/supabase-js';
import {riskFlags} from './property-risk.mjs';
process.loadEnvFile('.env.local');

const dir=process.argv[2]??'data/db-backup/2026-10-11';
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const groups=new Map();   // JSON flag set -> property ids
const add=(id,flags)=>{const k=JSON.stringify(flags);groups.set(k,[...(groups.get(k)??[]),id]);};

for await(const line of createInterface({input:createReadStream(`${dir}/court_observations.jsonl.gz`).pipe(createGunzip())})){
 const row=JSON.parse(line);add(row.property_id,riskFlags(row.payload?.note));
}
for(let after=null;;){
 let q=db.from('onbid_observations').select('property_id,detail_payload').not('detail_payload','is',null).order('property_id').limit(1000);
 if(after)q=q.gt('property_id',after);
 const {data,error}=await q;if(error)throw Error(error.message);
 for(const r of data){const d=r.detail_payload;add(r.property_id,riskFlags(d.pytnMtrsCont,d.icdlCdtnCont,d.cltrEtcCont));}
 if(data.length<1000)break;after=data.at(-1).property_id;
}
let rows=0;
for(const [flags,ids] of groups){
 for(let i=0;i<ids.length;i+=300){
  const {error}=await db.from('properties').update({risk_flags:JSON.parse(flags)}).in('id',ids.slice(i,i+300));
  if(error)throw Error(error.message);
 }
 rows+=ids.length;
}
console.log(`updated ${rows} properties in ${groups.size} flag sets`);
