// Assign the trades of one building (MOLIT lot) that several K-APT complexes share to the complex
// each trade belongs to. For every trade: the name MOLIT filed, if it settles one complex; otherwise
// the 동 number, only when it is exactly on one complex's 동 list. Rental complexes get no sales.
// A trade neither settles stays shared ("같은 번지 거래").
import {nameOrdinals,normalizeName,similarName,sharesNamePart} from './summary.mjs';

export const dongKey=b=>String(b??'').replace(/\s/g,'').replace(/동$/,'').toUpperCase()||null;
const NOT_FOR_SALE=new Set(['임대','사택 및 관사 등']);
export const isSaleComplex=c=>!NOT_FOR_SALE.has(c.sale_type);

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
// 동 → complex for this building: only 동 that are on one sale complex's 건축물대장 list, matched exactly
// (the lists are often copied across complexes on a lot, which leaves those 동 with no owner).
export function dongOwners(sale,buildings){
 const owners=new Map(),listed=new Map();
 for(const c of sale)for(const d of buildings.get(c.kapt_code)??[]){const k=dongKey(d);if(k)(listed.get(k)??listed.set(k,new Set()).get(k)).add(c.kapt_code);}
 for(const [d,set] of listed)if(set.size===1)owners.set(d,[...set][0]);
 return owners;
}
// A name part only one complex has: "달빛(라이프)2" is 라이프, even though both complexes are 달빛 2단지.
const WORDS=new Set(['마을','주공','시영','단지','아파트','타운','빌라','맨션','파크','하이츠','그린','임대']);
const partHits=(name,candidates)=>String(name??'').split(/[,.()[\]·\s]+/).flatMap(raw=>{
 const part=normalizeName(raw).replace(/\d+(차|단지|동)?/g,'');
 return part.length<2||WORDS.has(part)?[]:[candidates.filter(c=>normalizeName(c.name).includes(part)).map(c=>c.kapt_code)];
});
// "태산,대진.정광": a name listing several complexes settles one only if every part it names is that one.
// "플루리움4,5단지" is one complex: a comma before a digit only joins numbers.
const isList=name=>/[,.](?!\s*\d)/.test(String(name??''));
export function ownerOfName(name,candidates){
 const hits=partHits(name,candidates);
 if(isList(name)){const all=new Set(hits.flat());return all.size===1?[...all][0]:null;}
 const unique=new Set(hits.filter(h=>h.length===1).map(h=>h[0]));
 if(unique.size===1)return [...unique][0];
 const na=ordinals(name),base=normalizeName(name).replace(/\d+/g,'');
 // A complex named "45단지" answers to 4 and 5.
 const sameOrd=c=>{const nb=[...ordinals(c.name)].flatMap(n=>n>=10&&n<100&&n%11?[n,Math.floor(n/10),n%10]:[n]);return na.size&&nb.length&&[...na].some(n=>nb.includes(n));};
 // Strictest test first; a test that fits two complexes settles nothing. A name with no number
 // cannot pick one of several numbered complexes (similarName alone would call it 1단지).
 for(const fits of [c=>similarName(name,c.name)&&(na.size>0||!ordinals(c.name).size),
  c=>sharesNamePart(name,c.name)&&(!na.size||!ordinals(c.name).size||sameOrd(c)),
  c=>sameOrd(c)&&commonRun(base,normalizeName(c.name).replace(/\d+/g,''))>=2]){
  const found=candidates.filter(fits);
  if(found.length===1)return found[0].kapt_code;
  if(found.length>1)return null;
 }
 return null;
}
// A rent filed under a rental name belongs to the rental complex.
function rentOwner(name,complexes){
 const rental=complexes.filter(c=>!isSaleComplex(c));
 if(rental.length&&/임대/.test(String(name??'')))return rental.length===1?rental[0].kapt_code:ownerOfName(name,rental);
 return ownerOfName(name,complexes);
}
const unitsAt=(c,area)=>area<=60?c.units_le60:area<=85?c.units_le85:area<=135?c.units_le135:c.units_gt135;
// Why sales assigned by 동 number cannot be right, or null: more 동 than the complex has, or sizes
// K-APT says it does not have. Name-assigned sales are not judged here: the filed name is the evidence.
function dongImplausible(sale,rows){
 if(rows.length<10)return null;
 for(const c of sale){
  const mine=rows.filter(a=>a.owner===c.kapt_code);
  if(!mine.length)continue;
  const dongs=new Set(mine.map(a=>dongKey(a.t.building)).filter(Boolean));
  if(c.dong_count&&dongs.size>c.dong_count*1.2+1)return `${c.name}: 동 ${dongs.size}개 > 단지 ${c.dong_count}개`;
  if((c.units_le60??0)+(c.units_le85??0)+(c.units_le135??0)+(c.units_gt135??0)>0){
   const off=mine.filter(a=>!(unitsAt(c,a.t.area)>0)).length;
   if(off/mine.length>0.1)return `${c.name}: 없는 평형대 ${off}/${mine.length}건`;
  }
 }
 return null;
}
// complexes: [{kapt_code,name,sale_type,...}]; buildings: Map kapt_code → dong names.
// trades: [{key,deal,area,building,name}]. Returns the owner and method of each trade, per key.
export function splitTrades(complexes,trades,buildings){
 const sale=complexes.filter(isSaleComplex);
 const out=new Map();
 const put=(t,owner,method)=>out.set(t.key,{owner,method});
 const agree={dongName:{same:0,diff:0}};
 if(!sale.length){for(const t of trades)put(t,null,'none');return {result:out,sale,dropped:null,agree};}
 const dong=sale.length>1?dongOwners(sale,buildings):new Map();
 const byDongRows=[];
 for(const t of trades){
  if(t.deal!=='sale'){const owner=rentOwner(t.name,complexes);put(t,owner,owner?'name':'shared');continue;}
  if(sale.length===1){put(t,sale[0].kapt_code,'rental');continue;}
  const byName=ownerOfName(t.name,sale),byDong=dong.get(dongKey(t.building));
  if(byName&&byDong)agree.dongName[byName===byDong?'same':'diff']++;   // recorded only: the name wins
  if(byName){put(t,byName,'name');continue;}
  if(byDong){put(t,byDong,'dong');byDongRows.push({t,owner:byDong});continue;}
  put(t,null,'shared');
 }
 const dropped=dongImplausible(sale,byDongRows);
 if(dropped)for(const {t} of byDongRows)put(t,null,'shared');
 return {result:out,sale,dropped,agree};
}

export const childPlaceId=(parent,kapt)=>`${parent}:${kapt}`;
export const rentCopyId=(key,kapt)=>`${key}~${kapt}`;
// Where each trade of a shared building goes. complexes are the building's linked complexes.
// - One sale complex: the building stays that complex's. Each rental complex gets a small place of its
//   own, with the rents filed under it and copies of the rents no name settles, so it shows no sales.
// - Several sale complexes: each gets a small place with the trades assigned to it. What cannot be
//   assigned stays on the building, which all sale complexes keep linked ('shared_lot').
// Returns null when there is nothing to split.
export function planPlaceSplit(parentId,complexes,trades,buildings){
 if(complexes.length<2)return null;
 const ordered=[...complexes].sort((a,b)=>a.kapt_code<b.kapt_code?-1:1);
 const {result,sale,dropped,agree}=splitTrades(ordered,trades,buildings);
 if(!sale.length)return null;
 const rental=ordered.filter(c=>!isSaleComplex(c));
 const rentalCode=new Set(rental.map(c=>c.kapt_code));
 const many=sale.length>1;
 const rows=[],used=new Set();
 for(const t of trades){
  const {owner,method}=result.get(t.key);
  if(owner&&(many||rentalCode.has(owner))){const place_id=childPlaceId(parentId,owner);used.add(owner);rows.push({t,id:t.key,place_id,method});continue;}
  // A sale no complex can claim is held: listed on the building, out of every statistic until a later run settles it.
  rows.push({t,id:t.key,place_id:parentId,method,held:many&&t.deal==='sale'&&!owner});
  if(t.deal==='rent'&&!owner)for(const r of rental){used.add(r.kapt_code);rows.push({t,id:rentCopyId(t.key,r.kapt_code),place_id:childPlaceId(parentId,r.kapt_code),method:'rental_copy'});}
 }
 return {primary:sale[0].kapt_code,primaryMatch:many?'shared_lot':'shared_sale',alsoLinked:sale.slice(1).map(c=>c.kapt_code),
  children:ordered.filter(c=>used.has(c.kapt_code)).map(c=>({kapt_code:c.kapt_code,name:c.name})),rows,dropped,agree};
}
