// Assign the trades of one building (MOLIT lot) that several K-APT complexes share to the complex
// each trade belongs to. Order: rental complexes get no sales, then 동 number, then 전용면적, then the
// name MOLIT filed. A trade none of these settle stays shared ("같은 번지 거래").
import {nameOrdinals,normalizeName,similarName,sharesNamePart} from './summary.mjs';

export const dongKey=b=>String(b??'').replace(/\s/g,'').replace(/동$/,'').toUpperCase()||null;
const NOT_FOR_SALE=new Set(['임대','사택 및 관사 등']);
export const isSaleComplex=c=>!NOT_FOR_SALE.has(c.sale_type);
const AREA_TOLERANCE=0.015;
const MIN_LEARNED=5;

// "(주공2)" carries a 차수 that nameOrdinals, which ignores brackets, does not read.
function ordinals(name){
 const out=nameOrdinals(name);
 for(const m of String(name??'').matchAll(/\([^)]*?(\d+)\)/g))out.add(Number(m[1]));
 return out;
}
function commonRun(a,b){
 let best=0;
 for(let i=0;i<a.length;i++)for(let j=i+best+1;j<=a.length&&b.includes(a.slice(i,j));j++)best=j-i;
 return best;
}
// 동 → complex for this building: 건축물대장 동 lists where a 동 is on one complex only (the lists are
// often copied across complexes on a lot), then the 단지 number in the complex name (1601동 → 16단지).
export function dongOwners(sale,buildings,tradeDongs){
 const owners=new Map();
 const listed=new Map();
 for(const c of sale)for(const d of buildings.get(c.kapt_code)??[]){const k=dongKey(d);if(k)(listed.get(k)??listed.set(k,new Set()).get(k)).add(c.kapt_code);}
 for(const [d,set] of listed)if(set.size===1)owners.set(d,[...set][0]);
 // "플루리움45단지" next to 1·2·3단지 is 4단지 and 5단지 together.
 const small=sale.some(c=>[...ordinals(c.name)].some(n=>n<10));
 const ords=sale.map(c=>[...ordinals(c.name)].flatMap(n=>small&&n>=10&&n<100&&n%11?[Math.floor(n/10),n%10]:[n]));
 const every=ords.flat();
 if(ords.every(o=>o.length>=1&&(o.length===1||small))&&new Set(every).size===every.length){
  const byOrd=new Map(sale.flatMap((c,i)=>ords[i].map(n=>[n,c.kapt_code])));
  const hit=new Map();
  for(const d of tradeDongs){const n=Number(d);if(!Number.isInteger(n)||n<100)continue;const k=byOrd.get(Math.floor(n/100));if(k){hit.set(d,k);}}
  if(new Set(hit.values()).size===sale.length&&hit.size>=tradeDongs.size*0.7)for(const [d,k] of hit)if(!owners.has(d))owners.set(d,k);
 }
 return owners;
}
// A name part only one complex has: "달빛(라이프)2" is 라이프, even though both complexes are 달빛 2단지.
const WORDS=new Set(['마을','주공','시영','단지','아파트','타운','빌라','맨션','파크','하이츠','그린','임대']);
function ownerByPart(name,sale){
 const owners=new Set();
 for(const raw of String(name??'').split(/[,.()[\]·\s]+/)){
  const part=normalizeName(raw).replace(/\d+(차|단지|동)?/g,'');
  if(part.length<2||WORDS.has(part))continue;
  const hits=sale.filter(c=>normalizeName(c.name).includes(part));
  if(hits.length===1)owners.add(hits[0].kapt_code);
 }
 return owners.size===1?[...owners][0]:null;
}
function ownerOfName(name,sale){
 const na=ordinals(name),base=normalizeName(name).replace(/\d+/g,'');
 const sameOrd=c=>{const nb=ordinals(c.name);return na.size&&nb.size&&[...na].some(n=>nb.has(n));};
 const byPart=ownerByPart(name,sale);
 if(byPart)return byPart;
 // Strictest test first; a test that fits two complexes settles nothing.
 for(const fits of [c=>similarName(name,c.name),
  c=>sharesNamePart(name,c.name)&&(!na.size||!ordinals(c.name).size||sameOrd(c)),
  c=>sameOrd(c)&&commonRun(base,normalizeName(c.name).replace(/\d+/g,''))>=2]){
  const hits=sale.filter(fits);
  if(hits.length===1)return hits[0].kapt_code;
  if(hits.length>1)return null;
 }
 return null;
}
// areas of each complex that no other sale complex here has.
function areaOwner(area,lists){
 const hits=lists.filter(l=>l.areas.some(a=>Math.abs(a-area)<=AREA_TOLERANCE));
 return hits.length===1?hits[0].kapt_code:null;
}
// complexes: [{kapt_code,name,sale_type}]; buildings, types: Map kapt_code → dong names / 전용면적 list.
// trades: [{key,deal,area,building,name}]. Returns the owner and method of each trade, per key.
export function splitTrades(complexes,trades,buildings,types){
 const sale=complexes.filter(isSaleComplex);
 const out=new Map();
 const put=(t,owner,method)=>out.set(t.key,{owner,method});
 if(!sale.length){for(const t of trades)put(t,null,'none');return {result:out,sale,dropped:null};}
 if(sale.length===1){for(const t of trades)t.deal==='sale'?put(t,sale[0].kapt_code,'rental'):put(t,null,'shared');return {result:out,sale,dropped:null};}
 const sales=trades.filter(t=>t.deal==='sale');
 const tradeDongs=new Set(sales.map(t=>dongKey(t.building)).filter(Boolean));
 let dong=dongOwners(sale,buildings,tradeDongs);
 // A 동 map that puts many trades on a size its complex does not have is wrong: drop it.
 const listsOf=c=>({kapt_code:c.kapt_code,areas:types.get(c.kapt_code)??[]});
 const lists=sale.map(listsOf);
 const known=sales.filter(t=>dong.has(dongKey(t.building))&&lists.find(l=>l.kapt_code===dong.get(dongKey(t.building))).areas.length);
 const off=known.filter(t=>!lists.find(l=>l.kapt_code===dong.get(dongKey(t.building))).areas.some(a=>Math.abs(a-t.area)<=AREA_TOLERANCE)).length;
 let dropped=null;
 if(known.length&&off/known.length>0.2){dropped=`동 대응 ${off}/${known.length}건이 평형과 안 맞음`;dong=new Map();}
 // 전용면적 each complex shows in its 동-numbered sales, for trades filed without a 동.
 const learned=sale.map(c=>({kapt_code:c.kapt_code,counts:new Map()}));
 for(const t of sales){const k=dong.get(dongKey(t.building));if(k){const m=learned.find(l=>l.kapt_code===k).counts;m.set(t.area,(m.get(t.area)??0)+1);}}
 const learnedLists=learned.map(l=>({kapt_code:l.kapt_code,areas:[...l.counts].filter(([,n])=>n>=MIN_LEARNED).map(([a])=>a)}));
 const areaLists=lists.every(l=>l.areas.length)?lists:learnedLists;
 // Where 동 numbers exist, they test the weaker clues: one that often contradicts them is not used here.
 const agree={dongName:{same:0,diff:0},dongArea:{same:0,diff:0}};
 const tally=(bucket,a,b)=>{if(b)bucket[a===b?'same':'diff']++;};
 for(const t of sales){
  const byDong=dong.get(dongKey(t.building));
  if(byDong){tally(agree.dongName,byDong,ownerOfName(t.name,sale));tally(agree.dongArea,byDong,areaOwner(t.area,areaLists));}
 }
 const trust=({same,diff})=>diff<=same*0.2;
 const useName=trust(agree.dongName),useArea=trust(agree.dongArea);
 for(const t of trades){
  const byDong=t.deal==='sale'?dong.get(dongKey(t.building)):null;
  if(byDong){put(t,byDong,'dong');continue;}
  const byArea=useArea?areaOwner(t.area,areaLists):null;
  if(byArea){put(t,byArea,'area');continue;}
  const byName=useName?ownerOfName(t.name,sale):null;
  if(byName){put(t,byName,'name');continue;}
  put(t,null,'shared');
 }
 return {result:out,sale,dropped,agree};
}
