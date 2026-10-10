// Court photos are served from the public Supabase Storage bucket instead of Git.
// Files are content-addressed (sha256 name), so an existing object never needs replacing.
import {readFile} from 'node:fs/promises';
export const COURT_MEDIA_BUCKET='court-media';
const LOCAL=/^\/media\/court\/([a-f0-9]{64}\.webp)$/;

export function courtMediaUrl(path){
 const name=path?.match(LOCAL)?.[1];
 if(!name)return path;
 return `${process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/,'')}/storage/v1/object/public/${COURT_MEDIA_BUCKET}/${name}`;
}

export async function listCourtMedia(db){
 const present=new Set();
 for(let offset=0;;offset+=1000){
  const {data,error}=await db.storage.from(COURT_MEDIA_BUCKET).list('',{limit:1000,offset,sortBy:{column:'name',order:'asc'}});
  if(error)throw Error(`Photo storage list failed: ${error.message}`);
  data.forEach(o=>present.add(o.name));if(data.length<1000)break;
 }
 return present;
}

// Uploads local webp files for the given /media/court paths; already-present objects count as done.
export async function uploadCourtMedia(db,paths,{concurrency=8,onProgress}={}){
 let names=[...new Set(paths.map(p=>p?.match(LOCAL)?.[1]).filter(Boolean))];
 const result={uploaded:0,existing:0,failed:[]};let next=0;
 // Large batches (daily pipeline) list the bucket once rather than attempting every upload.
 if(names.length>200){
  const present=await listCourtMedia(db);
  const before=names.length;names=names.filter(n=>!present.has(n));result.existing=before-names.length;
 }
 const worker=async()=>{
  while(next<names.length){
   const name=names[next++];
   try{
    const body=await readFile(`public/media/court/${name}`);
    const {error}=await db.storage.from(COURT_MEDIA_BUCKET).upload(name,body,{contentType:'image/webp',cacheControl:'31536000',upsert:false});
    if(!error)result.uploaded++;
    else if(error.statusCode==='409'||/exists/i.test(error.message))result.existing++;
    else result.failed.push({name,message:error.message});
   }catch(error){result.failed.push({name,message:error.message});}
   onProgress?.(result,names.length);
  }
 };
 await Promise.all(Array.from({length:Math.min(concurrency,names.length)},worker));
 return result;
}
