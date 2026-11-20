// Remove non-apartment court and onbid records from the laptop's collection state (lineestate
// docs/apartment-only-plan.md 3-2 #5, 6단계; user "지금하면 되잖아" 2026-11-20). Both collectors take
// apartments only since 2026-11-08 and the site rows were deleted on 11-19, so these are leftovers.
//  - data/court/current.json: items whose use is not 아파트, unless registered in hidden-apartments.json
//    (the weekly --uses=all pass lists live non-apartment items again so hidden apartments can be found).
//  - data/onbid/detail-raw: cached detail answers whose listing is not an apartment and is not a target.
// Backups (gzip) go to data/backup/apartment-only-20261120 before anything is removed.
//   node scripts/prune-non-apt-cache.mjs            (dry run: counts and sizes)
//   node scripts/prune-non-apt-cache.mjs --apply
import {readFile,readdir,stat,unlink,mkdir,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {isApartmentUse} from './property-section.mjs';
import {onbidUse} from './onbid/core.mjs';
import {writeJson} from './onbid/atomic.mjs';

const apply=process.argv.includes('--apply');
const BACKUP='data/backup/apartment-only-20261120';
const COURT='data/court/current.json',DETAIL='data/onbid/detail-raw';
const summary={apply};

// Court
const state=JSON.parse(await readFile(COURT,'utf8'));
const hidden=JSON.parse(await readFile('data/court/hidden-apartments.json','utf8').catch(()=>'{"items":{}}'));
const courtKeys=Object.entries(state.items).filter(([k,i])=>!isApartmentUse(i.use)&&!i.hiddenApartment&&!hidden.items?.[k]).map(([k])=>k);
const queued=courtKeys.filter(k=>state.detailQueue?.[k]).length;
summary.court={items:Object.keys(state.items).length,remove:courtKeys.length,detailQueueRemove:queued,bytes:(await stat(COURT)).size};

// Onbid detail cache
const targets=new Set(Object.values(JSON.parse(await readFile('data/onbid/targets.json','utf8'))).map(r=>r.cltrMngNo));
const files=[];let bytes=0;
for(const f of await readdir(DETAIL)){
 const m=f.match(/^(.+)-(\d+)\.txt$/);if(!m||targets.has(m[1]))continue;
 let item;try{item=[].concat(JSON.parse(await readFile(`${DETAIL}/${f}`,'utf8')).body?.items?.item??[])[0];}catch{continue;}
 if(!item||isApartmentUse(onbidUse(item)))continue;   // unreadable or apartment: keep
 files.push(f);bytes+=(await stat(`${DETAIL}/${f}`)).size;
}
summary.onbid={files:(await readdir(DETAIL)).length,remove:files.length,removeBytes:bytes};

if(apply){
 await mkdir(BACKUP,{recursive:true});
 const removed=Object.fromEntries(courtKeys.map(k=>[k,{item:state.items[k],detailQueue:state.detailQueue?.[k]??null}]));
 await writeFile(`${BACKUP}/court-current-non-apt.json.gz`,gzipSync(JSON.stringify(removed)));
 const raw={};for(const f of files)raw[f]=await readFile(`${DETAIL}/${f}`,'utf8');
 await writeFile(`${BACKUP}/onbid-detail-raw-non-apt.json.gz`,gzipSync(JSON.stringify(raw)));   // {file name: content}
 for(const k of courtKeys){delete state.items[k];if(state.detailQueue)delete state.detailQueue[k];}
 await writeJson(COURT,state);
 for(const f of files)await unlink(`${DETAIL}/${f}`);
 summary.court.itemsAfter=Object.keys(state.items).length;summary.court.bytesAfter=(await stat(COURT)).size;
 summary.onbid.filesAfter=(await readdir(DETAIL)).length;
 summary.backup=BACKUP;
}
console.log(JSON.stringify(summary,null,1));
