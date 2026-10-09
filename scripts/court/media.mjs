import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseDetail } from './core.mjs';
import { replaceFile } from './store.mjs';

export async function saveMedia(payload) {
 const state=JSON.parse(await readFile('data/court/current.json','utf8'));
 const item=state.items[payload.key];
 if(!item||payload.court!==item.court||payload.caseNumber!==item.caseNumber||payload.itemNumber!==item.itemNumber)throw Error('Photo identity mismatch');
 if(new URL(payload.sourceUrl).origin!=='https://www.courtauction.go.kr'||!Number.isFinite(Date.parse(payload.observedAt)))throw Error('Invalid photo provenance');
 parseDetail(payload.detailRaw,item);
 if(!Array.isArray(payload.photos)||!payload.photos.length)throw Error('Invalid photos');
 await mkdir('public/media/court',{recursive:true});await mkdir('data/court/media',{recursive:true});
 let manifest=[];try{manifest=JSON.parse(await readFile('data/court/media/manifest.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const saved=[];
 for(const photo of payload.photos){
  if(!/^(전경도|관련사진)_\d+$/.test(photo.alt)||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(photo.dataUrl))throw Error('Unsupported photo');
  const original=Buffer.from(photo.dataUrl.split(',')[1],'base64');if(original.length>2*1024*1024)throw Error('Photo too large');
  const {data,info}=await sharp(original,{limitInputPixels:20_000_000}).rotate().resize({width:640,height:480,fit:'inside',withoutEnlargement:true}).webp({quality:60,effort:5}).toBuffer({resolveWithObject:true});
  const id=createHash('sha256').update(item.key).update(data).digest('hex');const path=`/media/court/${id}.webp`;
  await writeFile(`public${path}`,data);
  const entry={id,key:item.key,path,alt:photo.alt,source_url:payload.sourceUrl,observed_at:payload.observedAt,width:info.width,height:info.height,bytes:data.length,original_bytes:original.length};
  manifest=manifest.filter(m=>m.id!==id);manifest.push(entry);saved.push(entry);
 }
 await writeFile('data/court/media/manifest.next.json',JSON.stringify(manifest,null,2));await replaceFile('data/court/media/manifest.next.json','data/court/media/manifest.json');
 return {kind:'court-media',key:item.key,photos:saved.length,originalBytes:saved.reduce((s,m)=>s+m.original_bytes,0),webpBytes:saved.reduce((s,m)=>s+m.bytes,0)};
}
