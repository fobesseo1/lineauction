// Export properties outside 서울·경기·인천 and every row that references them, before deletion.
//   node scripts/backup-outside-capital.mjs
// Output: data/db-backup/<KST day>/outside-capital/<table>.jsonl.gz + manifest.json
import {mkdir,writeFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {createGzip} from 'node:zlib';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {createClient} from '@supabase/supabase-js';
process.loadEnvFile('.env.local');

const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());
const dir=`data/db-backup/${day}/outside-capital`;await mkdir(dir,{recursive:true});

const ids=[];
for(let from=0;;from+=1000){
 const {data,error}=await db.from('properties').select('id').not('sido','in','("서울특별시","경기도","인천광역시")').order('id').range(from,from+999);
 if(error)throw Error(error.message);ids.push(...data.map(r=>r.id));if(data.length<1000)break;
}
const tables=['properties','property_price_history','court_observations','property_lifecycle','property_lifecycle_history','property_comparisons','property_analysis','property_media','onbid_observations'];
const manifest={exportedAt:new Date().toISOString(),properties:ids.length,tables:{}};
for(const table of tables){
 const column=table==='properties'?'id':'property_id';
 const rows=[];
 for(let i=0;i<ids.length;i+=200){
  const {data,error}=await db.from(table).select('*').in(column,ids.slice(i,i+200));
  if(error)throw Error(`${table}: ${error.message}`);rows.push(...data);
 }
 await pipeline(Readable.from(rows.map(r=>JSON.stringify(r)+'\n')),createGzip(),createWriteStream(`${dir}/${table}.jsonl.gz`));
 manifest.tables[table]=rows.length;console.log(`${table}: ${rows.length}`);
}
await writeFile(`${dir}/manifest.json`,JSON.stringify(manifest,null,2));
console.log(`BACKUP_OK ${dir}`);
