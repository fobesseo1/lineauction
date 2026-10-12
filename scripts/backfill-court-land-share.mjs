// One-off: fill properties.land_area (대지권 면적) for existing court rows from the local court state.
// The court pipeline sets it from now on.
//   node scripts/backfill-court-land-share.mjs
import {readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {landShareM2} from './court/land-share.mjs';
process.loadEnvFile('.env.local');

const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const items=Object.values(JSON.parse(await readFile('data/court/current.json','utf8')).items);
const wanted=new Map();
for(const i of items){const land=landShareM2(i.detail?.raw);if(land)wanted.set(`${i.court}:${i.caseNumber}|${i.itemNumber}`,land);}
const ids=[];
for(let from=0;;from+=1000){
 const {data,error}=await db.from('properties').select('id,source_property_id,auction_condition_id').eq('source','court').order('id').range(from,from+999);
 if(error)throw Error(error.message);
 for(const r of data){const land=wanted.get(`${r.source_property_id}|${r.auction_condition_id}`);if(land)ids.push({id:r.id,land});}
 if(data.length<1000)break;
}
let done=0;
for(let i=0;i<ids.length;i+=20){
 await Promise.all(ids.slice(i,i+20).map(async r=>{const {error}=await db.from('properties').update({land_area:r.land}).eq('id',r.id);if(error)throw Error(error.message);}));
 done+=Math.min(20,ids.length-i);
}
console.log(`court items with land share ${wanted.size}, updated ${done}`);
