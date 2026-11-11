// Local collector state ("bundles") kept in the private Supabase Storage bucket 'factory-state', so
// any PC can continue the daily jobs. A job downloads its bundles before it starts (only when another
// PC uploaded a newer version) and uploads them when it finishes.
//   chunks/<sha256>.zst          32 MB raw pieces, zstd-compressed, shared by every version
//   manifests/<bundle>/<v>.json  which chunks make which files
// Big files are chunked on their own; small files are packed per folder first. Only chunks the
// bucket doesn't have yet are uploaded. Local files are never deleted; a file missing from a
// version is left as it is. The first version of each bundle is kept as the baseline.
//   node scripts/daily/bundle.mjs status|upload|download [bundle…] [--machine=name] [--baseline]
import {createHash} from 'node:crypto';
import {open,readFile,writeFile,readdir,stat,mkdir,rename,utimes} from 'node:fs/promises';
import {dirname} from 'node:path';
import {promisify} from 'node:util';
import zlib from 'node:zlib';
import {createClient} from '@supabase/supabase-js';
import {koreanDay} from './core.mjs';
import {loadEnv} from './env.mjs';

const zstd=promisify(zlib.zstdCompress),unzstd=promisify(zlib.zstdDecompress);
const BUCKET='factory-state',CHUNK=32<<20,BIG=8<<20,KEEP=2,PARALLEL=4;
const NOISE=[/\.log$/,/\.tmp$/,/\.lock$/,/\/STOP$/,/\.(stdout|stderr)(\.log)?$/,/\.\d+\.tmp$/,/-(wal|shm)$/,/\.html$/];
// Per-day API budgets and alert state are written by every job, so they travel in 'shared'.
const SHARED_FILES=['data/alerts/state.json','data/alerts/staff.json','data/molit/budget.json','data/complex/budget.json','data/onbid/budget.json','data/onbid/access-paused.json','data/court/pipeline/molit-request-budget.json','data/court/pipeline/molit-access-paused.json'];
export const BUNDLES={
 shared:{include:[...SHARED_FILES,'data/geo']},
 market:{include:['data/molit/warehouse.sqlite','data/molit/published-*','data/complex','data/building','data/calc','data/stations','data/schools','data/neighborhood','data/detail']},
 // raw/ holds list pages cached for one day; detail-raw/ holds the detail answers photos read.
 onbid:{include:['data/onbid'],exclude:[/^data\/onbid\/(raw|test-[^/]*|history)\//]},
 court:{include:['data/court/current.json','data/court/media','data/court/pipeline','data/court/standalone','data/court/results','data/court/progress','data/court/coverage.json','data/court/finalization.json','data/court/hidden-apartments.json'],
  exclude:[/^data\/court\/standalone\/(case-repair|all-photo|results-repair)/]},
};
export const JOB_BUNDLES={market:['shared','market'],onbid:['shared','onbid'],court:['shared','court']};
const localPath='data/daily/bundles.json';

loadEnv();
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const store=db.storage.from(BUCKET);
const sha=buf=>createHash('sha256').update(buf).digest('hex');
const readJson=async(path,fallback)=>{try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}};
const pool=async(items,fn)=>{let i=0;await Promise.all(Array.from({length:Math.min(PARALLEL,items.length)},async()=>{while(i<items.length)await fn(items[i++]);}));};
const retry=async fn=>{for(let a=1;;a++){try{return await fn();}catch(e){if(a>=4)throw e;await new Promise(r=>setTimeout(r,3000*a));}}};
const excluded=(path,spec)=>SHARED_FILES.includes(path)&&spec!==BUNDLES.shared||NOISE.some(re=>re.test(path))||(spec.exclude??[]).some(re=>re.test(path));

async function walk(path,out){
 let s;try{s=await stat(path);}catch(e){if(e.code==='ENOENT')return;throw e;}
 if(s.isDirectory()){for(const name of (await readdir(path)).sort())await walk(`${path}/${name}`,out);}
 else out.push({path,size:s.size,mtime:s.mtimeMs});
}
export async function localFiles(bundle){
 const spec=BUNDLES[bundle],out=[];
 for(const inc of spec.include){
  if(inc.endsWith('*')){const dir=dirname(inc),prefix=inc.slice(dir.length+1,-1);for(const name of (await readdir(dir).catch(()=>[])).sort())if(name.startsWith(prefix))await walk(`${dir}/${name}`,out);}
  else await walk(inc,out);
 }
 return out.filter(f=>!excluded(f.path,spec));
}

// Read a file's 32 MB pieces with their hashes, without holding the whole file in memory.
async function* pieces(path){
 const fh=await open(path,'r');
 try{for(let pos=0;;){const buf=Buffer.allocUnsafe(CHUNK);const {bytesRead}=await fh.read(buf,0,CHUNK,pos);if(!bytesRead)break;const b=buf.subarray(0,bytesRead);yield {buf:b,hash:sha(b)};pos+=bytesRead;}}
 finally{await fh.close();}
}
const packOf=path=>path.split('/').slice(0,3).join('/');   // e.g. data/onbid/detail-raw

async function hasChunk(hash){const {data}=await store.list('chunks',{search:`${hash}.zst`,limit:1});return !!data?.some(o=>o.name===`${hash}.zst`);}
async function putChunk(hash,buf,known,stats){
 if(known.has(hash))return;known.add(hash);
 if(await hasChunk(hash))return;
 const body=await zstd(buf);
 await retry(async()=>{const {error}=await store.upload(`chunks/${hash}.zst`,body,{contentType:'application/octet-stream',upsert:false});if(error&&!/exists|Duplicate/i.test(error.message))throw Error(`upload ${hash}: ${error.message}`);});
 stats.uploaded+=body.length;stats.chunks++;
}
async function getChunk(hash){
 return retry(async()=>{const {data,error}=await store.download(`chunks/${hash}.zst`);if(error)throw Error(`download ${hash}: ${error.message}`);const buf=await unzstd(Buffer.from(await data.arrayBuffer()));if(sha(buf)!==hash)throw Error(`chunk ${hash} corrupt`);return buf;});
}
async function getManifest(path){const {data,error}=await store.download(path);if(error)throw Error(`manifest ${path}: ${error.message}`);return JSON.parse(await data.text());}
export async function latestVersion(bundle){
 const {data,error}=await db.from('factory_bundle_versions').select('version,machine,created_at,manifest_path,baseline').eq('bundle',bundle).order('created_at',{ascending:false}).limit(1);
 if(error)throw Error(`versions: ${error.message}`);return data[0]??null;
}
export const localVersions=()=>readJson(localPath,{});
const setLocal=async(bundle,version)=>{const v=await localVersions();v[bundle]=version;await mkdir('data/daily',{recursive:true});await writeFile(localPath,JSON.stringify(v,null,1));};

// SQLite keeps recent writes in a -wal file; fold it in so the main file is the whole database.
async function checkpoint(files){
 const {DatabaseSync}=await import('node:sqlite');
 for(const f of files)if(f.path.endsWith('.sqlite')){const d=new DatabaseSync(f.path);d.exec('PRAGMA wal_checkpoint(TRUNCATE)');d.close();Object.assign(f,{size:(await stat(f.path)).size});}
}

export async function upload(bundle,{machine,baseline=false}={}){
 const started=Date.now(),stats={uploaded:0,chunks:0};
 const files=await localFiles(bundle);await checkpoint(files);
 const prev=await latestVersion(bundle);
 const known=new Set(),pm=prev?await getManifest(prev.manifest_path):null;
 for(const f of pm?.files??[])for(const h of f.chunks)known.add(h);
 for(const p of pm?.packs??[])for(const h of p.chunks)known.add(h);
 const big=files.filter(f=>f.size>=BIG),small=files.filter(f=>f.size<BIG);
 const manifest={bundle,machine,day:koreanDay(),createdAt:new Date().toISOString(),files:[],packs:[]};
 for(const f of big){
  const chunks=[];const queue=[];
  for await(const {buf,hash} of pieces(f.path)){chunks.push(hash);queue.push(putChunk(hash,buf,known,stats));if(queue.length>=PARALLEL)await Promise.all(queue.splice(0));}
  await Promise.all(queue);
  manifest.files.push({path:f.path,size:f.size,mtime:f.mtime,chunks});
 }
 const groups=new Map();for(const f of small){const k=packOf(f.path);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(f);}
 for(const [name,list] of groups){
  const bufs=[],entries=[];let offset=0;
  for(const f of list){const b=await readFile(f.path);bufs.push(b);entries.push({path:f.path,size:b.length,mtime:f.mtime,offset,hash:sha(b)});offset+=b.length;}
  const all=Buffer.concat(bufs),chunks=[];
  for(let i=0;i<all.length||i===0;i+=CHUNK){const b=all.subarray(i,i+CHUNK);const h=sha(b);chunks.push(h);await putChunk(h,b,known,stats);if(!all.length)break;}
  manifest.packs.push({name,size:all.length,chunks,entries});
 }
 const version=`${new Date(Date.now()+9*3600_000).toISOString().replace(/[-:]/g,'').slice(0,15)}-${machine}`;   // KST
 const manifestPath=`manifests/${bundle}/${version}.json`;
 const total=files.reduce((a,f)=>a+f.size,0);
 {const {error}=await store.upload(manifestPath,Buffer.from(JSON.stringify(manifest)),{contentType:'application/json',upsert:false});if(error)throw Error(`manifest: ${error.message}`);}
 const isBaseline=baseline||!prev;
 {const {error}=await db.from('factory_bundle_versions').insert({bundle,version,machine,baseline:isBaseline,bytes:stats.uploaded,total_bytes:total,manifest_path:manifestPath});if(error)throw Error(`version row: ${error.message}`);}
 await setLocal(bundle,version);
 await prune(bundle);
 return {bundle,version,baseline:isBaseline,files:files.length,totalBytes:total,uploadedBytes:stats.uploaded,newChunks:stats.chunks,seconds:Math.round((Date.now()-started)/1000)};
}

// Keep the baseline plus the newest KEEP versions; chunks no kept manifest uses are removed.
async function prune(bundle){
 const {data,error}=await db.from('factory_bundle_versions').select('version,baseline,manifest_path').eq('bundle',bundle).order('created_at',{ascending:false});
 if(error)throw Error(error.message);
 const drop=data.filter((v,i)=>!v.baseline&&i>=KEEP);
 if(!drop.length)return;
 for(const v of drop){await store.remove([v.manifest_path]);await db.from('factory_bundle_versions').delete().eq('bundle',bundle).eq('version',v.version);}
 const {data:kept,error:keptError}=await db.from('factory_bundle_versions').select('manifest_path');if(keptError)throw Error(keptError.message);
 const used=new Set();
 for(const v of kept){const m=await getManifest(v.manifest_path);for(const f of m.files)for(const h of f.chunks)used.add(h);for(const p of m.packs??[])for(const h of p.chunks)used.add(h);}
 for(let offset=0;;offset+=1000){
  const {data:objs,error:listError}=await store.list('chunks',{limit:1000,offset});if(listError)throw Error(listError.message);
  const gone=objs.map(o=>o.name).filter(n=>!used.has(n.replace(/\.zst$/,'')));
  if(gone.length){await store.remove(gone.map(n=>`chunks/${n}`));offset-=gone.length;}
  if(objs.length<1000)break;
 }
}

async function writeAtomic(path,buf,mtime){
 await mkdir(dirname(path),{recursive:true});
 const tmp=`${path}.download`;await writeFile(tmp,buf);
 await rename(tmp,path);await utimes(path,new Date(),new Date(mtime));
}
// A database replaced from another PC must not pick up this PC's old -wal journal.
async function setAsideJournal(path){for(const ext of ['-wal','-shm'])await rename(`${path}${ext}`,`${path}${ext}.stale-${Date.now()}`).catch(()=>{});}

// Bring the local bundle to the newest version. Returns {status:'current'|'downloaded'|'no-remote'}.
export async function download(bundle){
 const started=Date.now();
 const latest=await latestVersion(bundle);
 if(!latest)return {bundle,status:'no-remote'};
 if((await localVersions())[bundle]===latest.version)return {bundle,status:'current',version:latest.version};
 const m=await getManifest(latest.manifest_path);let fetched=0,written=0;
 for(const f of m.files){
  const local=[];try{for await(const {hash} of pieces(f.path))local.push(hash);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(local.length===f.chunks.length&&local.every((h,i)=>h===f.chunks[i])&&(await stat(f.path)).size===f.size)continue;
  // Reuse identical local pieces; fetch the rest. Pieces are assembled into <file>.download first.
  const tmp=`${f.path}.download`;await mkdir(dirname(f.path),{recursive:true});
  const out=await open(tmp,'w');
  try{
   let pos=0;const src=local.length?await open(f.path,'r'):null;
   try{for(let i=0;i<f.chunks.length;i++){
    let buf;
    if(local[i]===f.chunks[i]){buf=Buffer.allocUnsafe(CHUNK);const {bytesRead}=await src.read(buf,0,CHUNK,i*CHUNK);buf=buf.subarray(0,bytesRead);}
    else{buf=await getChunk(f.chunks[i]);fetched+=buf.length;}
    await out.write(buf,0,buf.length,pos);pos+=buf.length;
   }}finally{await src?.close();}
  }finally{await out.close();}
  if(f.path.endsWith('.sqlite'))await setAsideJournal(f.path);
  await rename(tmp,f.path);await utimes(f.path,new Date(),new Date(f.mtime));written++;
 }
 for(const p of m.packs??[]){
  const differ=[];for(const e of p.entries){const b=await readFile(e.path).catch(()=>null);if(!b||sha(b)!==e.hash)differ.push(e);}
  if(!differ.length)continue;
  const parts=[];for(const h of p.chunks){const b=await getChunk(h);fetched+=b.length;parts.push(b);}
  const all=Buffer.concat(parts);
  for(const e of differ){await writeAtomic(e.path,all.subarray(e.offset,e.offset+e.size),e.mtime);written++;}
 }
 await setLocal(bundle,latest.version);
 return {bundle,status:'downloaded',version:latest.version,from:latest.machine,files:written,fetchedBytes:fetched,seconds:Math.round((Date.now()-started)/1000)};
}

export async function status(bundle){
 const [latest,local]=await Promise.all([latestVersion(bundle),localVersions()]);
 const files=await localFiles(bundle);
 return {bundle,remote:latest?.version??null,local:local[bundle]??null,current:!!latest&&latest.version===local[bundle],files:files.length,bytes:files.reduce((a,f)=>a+f.size,0)};
}

if(import.meta.url===`file:///${process.argv[1].replace(/\\/g,'/')}`||process.argv[1]?.endsWith('bundle.mjs')){
 const [cmd,...rest]=process.argv.slice(2);
 const names=rest.filter(a=>!a.startsWith('--'));const list=names.length?names:Object.keys(BUNDLES);
 const machine=process.argv.find(a=>a.startsWith('--machine='))?.slice(10)??process.env.FACTORY_MACHINE??(await import('node:os')).hostname();
 for(const b of list){
  if(!BUNDLES[b])throw Error(`unknown bundle ${b}`);
  const r=cmd==='upload'?await upload(b,{machine,baseline:process.argv.includes('--baseline')}):cmd==='download'?await download(b):await status(b);
  console.log(JSON.stringify(r));
 }
}
