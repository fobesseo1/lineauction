// Undo the shared-building split from a shared-split-backup.mjs folder.
//   node scripts/molit/shared-split-rollback.mjs <folder> [--dry-run]
// Order matters: market_places rows cascade to their trades, so trades go back to the building first.
//   1. trades and rents on the small places → back on their building; rent copies deleted
//   2. small places deleted (their stats and links go with them)
//   3. the buildings' kapt_code, their stats and the link table restored from the backup
// Afterwards: add SHARED_SPLIT=off to .env.local (or the next publish splits again), run
// publish.mjs --with-villas --full, then scripts/refresh-recommend.mjs and clear the site cache.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createClient} from '@supabase/supabase-js';
process.loadEnvFile('.env.local');
const dir=process.argv[2],dryRun=process.argv.includes('--dry-run');if(!dir)throw Error('folder needed');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const read=name=>JSON.parse(readFileSync(join(dir,name),'utf8'));
const must=({data,error,count})=>{if(error)throw Error(error.message);return data??count;};
async function pages(q){const out=[];for(let from=0;;from+=1000){const rows=must(await q().range(from,from+999));out.push(...rows);if(rows.length<1000)return out;}}
const [links,places,stats]=['links.json','places.json','stats.json'].map(read);
const children=await pages(()=>db.from('market_places').select('id').eq('kapt_match','shared_split').order('id'));
const parentOf=id=>id.slice(0,id.lastIndexOf(':'));
const known=new Set(places.map(p=>p.id));
for(const {id} of children)if(!known.has(parentOf(id)))throw Error(`small place without a backed-up building: ${id}`);
const copies=must(await db.from('market_rents').select('id',{count:'exact',head:true}).like('id','%~%'));
console.log(JSON.stringify({children:children.length,rentCopies:copies,restoreLinks:links.length,restorePlaces:places.length,restoreStats:stats.length,dryRun}));
if(dryRun)process.exit(0);
const batch=async(rows,fn,size=500)=>{for(let i=0;i<rows.length;i+=size)must(await fn(rows.slice(i,i+size)));};
const {error:copyError}=await db.from('market_rents').delete().like('id','%~%');if(copyError)throw Error(copyError.message);
for(const {id} of children){
 const parent=parentOf(id);
 for(const table of ['market_trades','market_rents']){const {error}=await db.from(table).update({place_id:parent}).eq('place_id',id);if(error)throw Error(`${table}: ${error.message}`);}
}
await batch(children.map(c=>c.id),ids=>db.from('market_places').delete().in('id',ids),200);
await batch(places,rows=>db.from('market_places').upsert(rows,{onConflict:'id'}));
await batch(stats,rows=>db.from('market_area_stats').upsert(rows,{onConflict:'place_id,area_type'}));
const backedUp=new Set(links.map(l=>`${l.place_id}|${l.kapt_code}`));
const now=await pages(()=>db.from('market_place_complexes').select('place_id,kapt_code').order('place_id').order('kapt_code'));
for(const l of now)if(!backedUp.has(`${l.place_id}|${l.kapt_code}`)){const {error}=await db.from('market_place_complexes').delete().eq('place_id',l.place_id).eq('kapt_code',l.kapt_code);if(error)throw Error(error.message);}
await batch(links,rows=>db.from('market_place_complexes').upsert(rows,{onConflict:'place_id,kapt_code'}));
console.log('ROLLED BACK. Next: SHARED_SPLIT=off in .env.local, publish.mjs --with-villas --full, refresh-recommend, clear the site cache.');
