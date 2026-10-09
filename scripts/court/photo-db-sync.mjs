// Synchronize additional photos without re-querying MOLIT or rewriting court state.
import {readFile,writeFile,open,unlink} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
process.loadEnvFile('.env.local');
const root='data/court/pipeline';
const keyFile=process.argv.find(x=>x.startsWith('--keys-file='))?.slice(12);
if(!keyFile)throw Error('Photo sync requires a key checkpoint');
const keys=new Set(JSON.parse(await readFile(keyFile,'utf8')));
const lock=await open(`${root}/running.lock`,'wx');
await lock.writeFile(JSON.stringify({pid:process.pid,mode:'photo-sync'}));
const report={startedAt:new Date().toISOString(),media:0,errors:[]};
try{
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
 const manifest=JSON.parse(await readFile('data/court/media/manifest.json','utf8')).filter(m=>keys.has(m.key));
 const ids=new Map();
 for(let offset=0;;offset+=1000){const {data,error}=await db.from('properties').select('id,source_property_id,auction_condition_id').eq('source','court').order('id').range(offset,offset+999);if(error)throw Error('Photo property lookup failed');for(const p of data)ids.set(`${p.source_property_id}:${p.auction_condition_id}`,p.id);if(data.length<1000)break;}
 const media=manifest.map(m=>{const property_id=ids.get(m.key);if(!property_id)throw Error('Photo has no persisted property identity');const entry={...m};delete entry.key;return {...entry,property_id,sort_order:Number(m.alt?.match(/_(\d+)$/)?.[1]??99)};});
 for(let offset=0;offset<media.length;offset+=200){const {error}=await db.from('property_media').upsert(media.slice(offset,offset+200));if(error)throw Error(`Photo DB write failed (${error.code})`);report.media+=Math.min(200,media.length-offset);}
 report.status='completed';
}catch(error){report.status='failed';report.errors.push({stage:'property_media',message:error.message});process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await writeFile(`${root}/photos-latest.json`,JSON.stringify(report,null,2));await lock.close();await unlink(`${root}/running.lock`);console.log(JSON.stringify(report));}
