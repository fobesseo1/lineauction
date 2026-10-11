// One-off: set properties.section for the mixed court category "상가,오피스텔,근린시설",
// which needs the court asset text. Reads it from the local DB backup (payloads are no
// longer stored in the DB). Every other row was backfilled by the migration.
//   node scripts/backfill-property-section.mjs [backup-dir]
import {createReadStream} from 'node:fs';
import {createGunzip} from 'node:zlib';
import {createInterface} from 'node:readline';
import {createClient} from '@supabase/supabase-js';
import {sectionOf,courtSectionText} from './property-section.mjs';
process.loadEnvFile('.env.local');

const dir=process.argv[2]??'data/db-backup/2026-10-11';
const MIXED='상가,오피스텔,근린시설';
const bySection={apartment:[],commercial:[]};
for await(const line of createInterface({input:createReadStream(`${dir}/court_observations.jsonl.gz`).pipe(createGunzip())})){
 const row=JSON.parse(line);
 if(row.payload?.use!==MIXED)continue;
 bySection[sectionOf(MIXED,courtSectionText(row.payload))].push(row.property_id);
}
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
for(const [section,ids] of Object.entries(bySection)){
 for(let i=0;i<ids.length;i+=300){
  const {error}=await db.from('properties').update({section}).eq('source','court').eq('usage_type',MIXED).in('id',ids.slice(i,i+300));
  if(error)throw Error(error.message);
 }
 console.log(`${section}: ${ids.length}`);
}
