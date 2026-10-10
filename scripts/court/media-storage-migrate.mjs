// One-time upload of existing court photos to Supabase Storage. Safe to re-run:
// objects already in the bucket are counted as existing and skipped.
import {readdir,writeFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {uploadCourtMedia} from './media-storage.mjs';
process.loadEnvFile('.env.local');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const report='data/court/media/storage-migration.json';
const save=v=>writeFile(report,JSON.stringify({...v,at:new Date().toISOString()},null,2));
const files=(await readdir('public/media/court')).filter(n=>/^[a-f0-9]{64}\.webp$/.test(n));
let last=0;
const result=await uploadCourtMedia(db,files.map(n=>`/media/court/${n}`),{concurrency:8,onProgress:async(r,total)=>{
 const done=r.uploaded+r.existing+r.failed.length;
 if(done-last>=1000||done===total){last=done;console.log(`${done}/${total} uploaded=${r.uploaded} existing=${r.existing} failed=${r.failed.length}`);await save({stage:'upload',total,uploaded:r.uploaded,existing:r.existing,failed:r.failed.length});}
}});
await save({stage:'upload-finished',total:files.length,uploaded:result.uploaded,existing:result.existing,failed:result.failed.length,failedSample:result.failed.slice(0,50)});
console.log(JSON.stringify({total:files.length,uploaded:result.uploaded,existing:result.existing,failed:result.failed.length}));
if(result.failed.length)process.exitCode=1;
