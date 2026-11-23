// OpenStreetMap Overpass requests and their file caches, shared by stations, schools and neighborhood.
// The public servers are free and often full (502/504, "at capacity"), so each retry goes to the next
// server, and a cached answer that cannot be refreshed today is used as it is (2026-11-22: one 502 on
// a new area's tile failed the whole schools step).
import {readFile,stat} from 'node:fs/promises';
import {writeJson} from '../onbid/atomic.mjs';
import {OVERPASS_URL} from './stations-core.mjs';

export const OVERPASS_URLS=[OVERPASS_URL,'https://overpass.private.coffee/api/interpreter','https://overpass.kumi.systems/api/interpreter'];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// allowEmpty: a tile may truly have no element of a kind; a whole area (stations) never does.
// deadline (ms epoch): no retry starts after it, so one slow tile cannot use up a step's whole time.
export async function fetchOverpass(query,{allowEmpty=false,urls=OVERPASS_URLS,wait=20_000,deadline=Infinity}={}){
 for(let attempt=0;;attempt++){
  try{
   // overpass-api.de answers 406 to requests without a User-Agent.
   const r=await fetch(urls[attempt%urls.length],{method:'POST',headers:{'user-agent':'lineestate-data-factory/1.0','content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(200_000)});
   const text=await r.text();
   if(!r.ok)throw Error(`OVERPASS_${r.status}`);
   const json=JSON.parse(text);
   if(!Array.isArray(json.elements)||(!allowEmpty&&!json.elements.length))throw Error('OVERPASS_EMPTY');
   return json;
  }catch(e){if(attempt>=urls.length*2-1||Date.now()+wait*(attempt+1)>=deadline)throw e;await sleep(wait*(attempt+1));}
 }
}

export const ageDays=async p=>{try{return (Date.now()-(await stat(p)).mtimeMs)/86400_000;}catch(e){if(e.code==='ENOENT')return Infinity;throw e;}};

// A cache file refetched when older than maxDays (or with refresh). Returns {status, data, error}:
// 'cached' (fresh enough), 'fetched', 'stale' (refetch failed, the old answer is used) or 'missing'
// (refetch failed and nothing was ever fetched: data is null, the caller leaves that part out).
// After `deadline` nothing more is fetched (TIME_BUDGET): the daily run writes what it has instead of being
// killed at its step limit, and the next day starts from the files saved so far (2026-11-23: 전북·강원's
// first fetch on slow servers took schools and neighborhood past 30 minutes and nothing was written).
export const TIME_BUDGET='TIME_BUDGET';
// `--fetch-minutes N` on the command line → the fetch deadline (none when absent: a manual run fetches all).
export function deadlineFromArgs(argv,now=Date.now()){
 const i=argv.indexOf('--fetch-minutes'),n=i>=0?Number(argv[i+1]):NaN;
 return Number.isFinite(n)&&n>0?now+n*60_000:Infinity;
}
export async function cachedAnswer(path,maxDays,fetcher,{refresh=false,deadline=Infinity}={}){
 const age=await ageDays(path);
 if(refresh||age>maxDays){
  try{if(Date.now()>=deadline)throw Error(TIME_BUDGET);const data=await fetcher();await writeJson(path,data);return {status:'fetched',data};}
  catch(error){
   if(age===Infinity)return {status:'missing',data:null,error};
   return {status:'stale',data:JSON.parse(await readFile(path,'utf8')),error,age};
  }
 }
 return {status:'cached',data:JSON.parse(await readFile(path,'utf8'))};
}
