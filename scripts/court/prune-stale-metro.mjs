// One-off for turning on the 광역시·세종 (2026-11-18, lineestate docs/metro-expansion-plan.md 7-1).
// data/court/current.json still holds items from the 2026-10-07 nationwide test pass. Once a region is
// enabled, the pipeline would upsert its old apartment items, and refresh_current_rounds() keeps a past
// sale date without a closed lifecycle as current: weeks-old items would come back as "진행 중".
// This removes items whose every asset address is in a newly enabled non-capital region and that were
// last seen before --before (default 2026-11-01). Capital items and other provinces are left alone;
// the next court run lists the regions' live items again with fresh dates.
//   node scripts/court/prune-stale-metro.mjs            (dry run: counts only)
//   node scripts/court/prune-stale-metro.mjs --apply    (backs up current.json first)
import {copyFile,readFile} from 'node:fs/promises';
import {ENABLED_REGIONS,sidoPrefixPattern} from '../regions.mjs';
import {writeJson} from '../onbid/atomic.mjs';

const PATH='data/court/current.json';
const args=process.argv.slice(2);
const apply=args.includes('--apply');
const before=args.includes('--before')?args[args.indexOf('--before')+1]:'2026-11-01T00:00:00Z';
if(Number.isNaN(Date.parse(before)))throw Error(`BAD_BEFORE: ${before}`);

export function staleMetroKeys(state,metroNames,beforeIso){
 if(!metroNames.length)throw Error('NO_METRO_ENABLED'); // an empty pattern would match nothing sensible
 const metro=sidoPrefixPattern(metroNames);
 const keys=[];
 for(const [key,item] of Object.entries(state.items??{})){
  const addresses=(item.assets??[]).map(a=>a.address?.trim()).filter(Boolean);
  if(!addresses.length||!addresses.every(a=>metro.test(a)))continue;
  if(!(item.lastSeenAt&&item.lastSeenAt<beforeIso))continue;
  keys.push(key);
 }
 return keys;
}

const metroNames=ENABLED_REGIONS.filter(r=>r.area!=='capital').map(r=>r.name);
// Runs only as a script (the test imports staleMetroKeys without touching files).
if(String(process.argv[1]??'').replace(/\\/g,'/').endsWith('scripts/court/prune-stale-metro.mjs')){
 if(!metroNames.length)throw Error('NO_METRO_ENABLED');
 const state=JSON.parse(await readFile(PATH,'utf8'));
 const keys=staleMetroKeys(state,metroNames,before);
 const byCourt={};for(const k of keys){const c=state.items[k].court;byCourt[c]=(byCourt[c]??0)+1;}
 const queued=keys.filter(k=>state.detailQueue?.[k]).length;
 const summary={before,items:Object.keys(state.items).length,remove:keys.length,detailQueueRemove:queued,byCourt,apply};
 if(apply&&keys.length){
  const backup=`${PATH}.bak-${new Date().toISOString().replace(/[:.]/g,'-')}`;
  await copyFile(PATH,backup);summary.backup=backup;
  for(const k of keys){delete state.items[k];if(state.detailQueue)delete state.detailQueue[k];}
  await writeJson(PATH,state);
  summary.itemsAfter=Object.keys(state.items).length;
 }
 console.log(JSON.stringify(summary,null,1));
}
