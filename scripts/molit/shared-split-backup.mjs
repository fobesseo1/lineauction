// Before the shared-building split goes live: save what a rollback needs (read-only).
//   node scripts/molit/shared-split-backup.mjs <folder>
// Writes links.json (the whole link table), places.json and stats.json (rows of every building that
// several complexes share), and counts.json.
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createClient} from '@supabase/supabase-js';
process.loadEnvFile('.env.local');
const dir=process.argv[2];if(!dir)throw Error('folder needed');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
async function all(table,cols,f=q=>q){const out=[];for(let from=0;;from+=1000){const {data,error}=await f(db.from(table).select(cols)).range(from,from+999);if(error)throw Error(`${table}: ${error.message}`);out.push(...data);if(data.length<1000)break;}return out;}
const inChunks=async(table,cols,key,values,order)=>{const out=[];for(let i=0;i<values.length;i+=200)out.push(...await all(table,cols,q=>q.in(key,values.slice(i,i+200)).order(order[0]).order(order[1]??order[0])));return out;};
const links=await all('market_place_complexes','*',q=>q.order('place_id').order('kapt_code'));
const count=new Map();for(const l of links)count.set(l.place_id,(count.get(l.place_id)??0)+1);
const shared=[...count].filter(([,n])=>n>1).map(([id])=>id);
const places=await inChunks('market_places','*','id',shared,['id']);
const stats=await inChunks('market_area_stats','*','place_id',shared,['place_id','area_type']);
mkdirSync(dir,{recursive:true});
for(const [name,rows] of Object.entries({links,places,stats}))writeFileSync(join(dir,`${name}.json`),JSON.stringify(rows));
const counts={at:new Date().toISOString(),links:links.length,sharedPlaces:shared.length,places:places.length,stats:stats.length};
writeFileSync(join(dir,'counts.json'),JSON.stringify(counts));
console.log(JSON.stringify(counts));
