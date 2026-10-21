// Onbid photos for current listings → Supabase Storage (bucket onbid-media) + public.property_media.
//   node scripts/onbid/photos.mjs [--limit N]
// The detail answers already saved in data/onbid/detail-raw carry each listing's photo links
// (potoUrlList), so no Onbid API call is made. Those links point at 8KB thumbnails
// (downloadImageKind=THNL_NM); without that parameter the same link returns the original (often
// 3–4MB). Up to 5 originals per listing are downloaded one at a time, shrunk to 1024px webp and
// stored by content hash. A listing's earlier single thumbnail row is replaced once its photos exist.
// Progress is kept in data/onbid/media/manifest.json, so a stopped run resumes.
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {mkdir,readFile,readdir} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {writeJson} from './atomic.mjs';
import {singleRun} from '../single-run.mjs';
process.loadEnvFile('.env.local');

export const BUCKET='onbid-media';
export const MAX_PHOTOS=5;
// Photo links of one listing's detail answer, originals first by attachment order, deduplicated.
export function photoLinks(details){
 const seen=new Map();
 for(const d of details)for(const p of [].concat(d?.potoUrlList??[])){
  let u;try{u=new URL(p?.urlAdr);}catch{continue;}
  if(u.origin!=='https://www.onbid.co.kr'||!u.pathname.endsWith('/dnldFile.do'))continue;
  u.searchParams.delete('downloadImageKind');
  const key=`${u.searchParams.get('atchFileLstNo')}:${u.searchParams.get('atchSn')}`;
  if(!seen.has(key))seen.set(key,{url:u.toString(),sn:Number(u.searchParams.get('atchSn'))||0});
 }
 return [...seen.values()].sort((a,b)=>a.sn-b.sn).slice(0,MAX_PHOTOS);
}

if(import.meta.url===`file:///${(process.argv[1]??'').replace(/\\/g,'/')}`){
 const limitArg=process.argv.indexOf('--limit');const limit=limitArg>0?Number(process.argv[limitArg+1]):Infinity;
 const root='data/onbid/media';await mkdir(root,{recursive:true});
 if(!await singleRun(root,'scripts/onbid/photos.mjs')){console.log('ALREADY_RUNNING');process.exit(0);}
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const manifestPath=`${root}/manifest.json`;
 let manifest={};try{manifest=JSON.parse(await readFile(manifestPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const publicUrl=name=>`${process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/,'')}/storage/v1/object/public/${BUCKET}/${name}`;

 // Public bucket, created on first use.
 {const {data}=await db.storage.getBucket(BUCKET);if(!data){const {error}=await db.storage.createBucket(BUCKET,{public:true,fileSizeLimit:'5MB',allowedMimeTypes:['image/webp']});if(error&&!/exists/i.test(error.message))throw Error(`bucket: ${error.message}`);}}

 // Current Onbid listings and the ones that already show stored photos.
 const props=[];
 for(let from=0;;from+=1000){const {data,error}=await db.from('properties').select('id,source_property_id').eq('source','onbid').eq('is_current',true).order('id').range(from,from+999);if(error)throw Error(error.message);props.push(...data);if(data.length<1000)break;}
 const hasPhotos=new Set();
 for(let i=0;i<props.length;i+=300){const {data,error}=await db.from('property_media').select('property_id').like('id','onbid-photo:%').in('property_id',props.slice(i,i+300).map(p=>p.id));if(error)throw Error(error.message);data.forEach(r=>hasPhotos.add(r.property_id));}
 const files=new Map();for(const f of await readdir('data/onbid/detail-raw')){const m=f.match(/^(.+)-(\d+)\.txt$/);if(!m)continue;if(!files.has(m[1]))files.set(m[1],[]);files.get(m[1]).push(f);}

 const stats={current:props.length,alreadyShown:0,noDetail:0,noPhotos:0,listings:0,downloaded:0,failed:0,rows:0};
 let processedListings=0;
 for(const p of props){
  if(hasPhotos.has(p.id)){stats.alreadyShown++;continue;}
  const mng=p.source_property_id;
  if(!manifest[mng]){
   if(processedListings>=limit)break;
   const names=files.get(mng);if(!names){stats.noDetail++;continue;}
   const details=[];for(const n of names){try{details.push(...[].concat(JSON.parse(await readFile(`data/onbid/detail-raw/${n}`,'utf8')).body?.items?.item??[]));}catch{}}
   const links=photoLinks(details);
   const photos=[];
   for(const [i,link] of links.entries()){
    try{
     const r=await fetch(link.url,{signal:AbortSignal.timeout(60000)});
     if(!r.ok)throw Error(`HTTP ${r.status}`);
     const original=Buffer.from(await r.arrayBuffer());
     if(original.length>40*1024*1024)throw Error('too large');
     const {data,info}=await sharp(original,{limitInputPixels:80_000_000}).rotate().resize({width:1024,height:768,fit:'inside',withoutEnlargement:true}).webp({quality:70,effort:4}).toBuffer({resolveWithObject:true});
     const name=`${createHash('sha256').update(mng).update(data).digest('hex')}.webp`;
     const up=await db.storage.from(BUCKET).upload(name,data,{contentType:'image/webp',cacheControl:'31536000',upsert:false});
     if(up.error&&!/exists|Duplicate/i.test(up.error.message))throw Error(`upload: ${up.error.message}`);
     photos.push({name,source_url:link.url,width:info.width,height:info.height,bytes:data.length,original_bytes:original.length,order:i});
     stats.downloaded++;
    }catch(e){stats.failed++;console.error(`${mng} photo ${i+1}: ${e.message}`);}
    await sleep(300);
   }
   manifest[mng]={at:new Date().toISOString(),photos};processedListings++;stats.listings++;
   if(processedListings%50===0){await writeJson(manifestPath,manifest);console.log(`listings ${processedListings}, photos ${stats.downloaded}`);}
  }
  const photos=manifest[mng].photos;
  if(!photos.length){stats.noPhotos++;continue;}
  const observed=manifest[mng].at;
  const rows=photos.map((ph,i)=>({id:`onbid-photo:${p.id}:${i}`,property_id:p.id,path:publicUrl(ph.name),source_url:ph.source_url,observed_at:observed,
   width:ph.width,height:ph.height,bytes:ph.bytes,original_bytes:ph.original_bytes,alt:`온비드 사진 ${i+1}`,sort_order:i}));
  const {error}=await db.from('property_media').upsert(rows,{onConflict:'id'});if(error)throw Error(`media rows: ${error.message}`);
  await db.from('property_media').delete().eq('id',`onbid-api-thumbnail:${p.id}`);
  stats.rows+=rows.length;
 }
 await writeJson(manifestPath,manifest);
 console.log(JSON.stringify(stats));
}
