// Export raw observation tables to local gzip JSONL before they are slimmed in Supabase.
//   node scripts/db-backup-observations.mjs
// Output: data/db-backup/<KST day>/<table>.jsonl.gz plus a manifest with row counts.
import {mkdir,writeFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {createGzip} from 'node:zlib';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {createClient} from '@supabase/supabase-js';
process.loadEnvFile('.env.local');

const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());
const dir=`data/db-backup/${day}`;await mkdir(dir,{recursive:true});
const tables={court_observations:'property_id',onbid_observations:'property_id',property_media_path_backup:'id'};
const manifest={exportedAt:new Date().toISOString(),tables:{}};

for(const [table,key] of Object.entries(tables)){
 const {count,error:countError}=await db.from(table).select('*',{count:'exact',head:true});
 if(countError)throw Error(`${table}: ${countError.message}`);
 let written=0;
 async function* rows(){
  // Keyset pagination on the primary key keeps every page cheap and the order stable.
  let after=null;
  for(;;){
   let q=db.from(table).select('*').order(key).limit(500);
   if(after!==null)q=q.gt(key,after);
   const {data,error}=await q;
   if(error)throw Error(`${table}: ${error.message}`);
   for(const r of data){written++;yield JSON.stringify(r)+'\n';}
   if(data.length<500)return;
   after=data.at(-1)[key];
  }
 }
 await pipeline(Readable.from(rows()),createGzip(),createWriteStream(`${dir}/${table}.jsonl.gz`));
 if(written!==count)throw Error(`${table}: exported ${written} of ${count} rows`);
 manifest.tables[table]={rows:written,file:`${table}.jsonl.gz`};
 console.log(`${table}: ${written} rows`);
}
await writeFile(`${dir}/manifest.json`,JSON.stringify(manifest,null,2));
console.log(`BACKUP_OK ${dir}`);
