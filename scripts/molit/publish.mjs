// Rebuild the Supabase market_* summary tables from the local trade warehouse.
//   node scripts/molit/publish.mjs --with-villas [--dry-run] [--full] [--allow-large-delete]
// Only new or changed rows are written (content digest) and vanished rows deleted,
// so screens never see an empty table mid-run.
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {writeJson} from '../onbid/atomic.mjs';
import {guardDeletes} from '../daily/delete-guard.mjs';
import {planPlaceSplit,childPlaceId,nrgSalesPlan} from './shared-split.mjs';
import {sendMessage} from '../alerts/telegram.mjs';
import {regionCatalog} from '../court/regions.mjs';
import {leafRegions} from './core.mjs';
import {placeId,jibunPnu,areaStats,periodStart,normalizeName,similarName,sharesNamePart,monthlyHistory,saleBasis,validSale,applyManualLinks,newUnlinked,uniqueLinks} from './summary.mjs';
process.loadEnvFile('.env.local');

const dryRun=process.argv.includes('--dry-run');
// 빌라 buildings (kind 'rh') are published only with --with-villas until lineestate filters every
// market_places read by kind; then the daily job turns it on.
const KINDS=process.argv.includes('--with-villas')?"'apt','offi','rh'":"'apt','offi'";
const runAt=new Date().toISOString();
const start=periodStart(new Date());
const end=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
const supa=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const wh=new DatabaseSync('data/molit/warehouse.sqlite',{readOnly:true});

// 법정동 code and K-APT complex lookups from public.complexes.
// A complex is matched by lot (PNU) first, then by the same 법정동 and normalized name, which
// also covers complexes whose detail (and so PNU) is not collected yet.
const bjdByDong=new Map(),kaptByPnu=new Map(),kaptByName=new Map(),complexList=[];
for(let from=0;;from+=1000){
 const {data,error}=await supa.from('complexes').select('kapt_code,bjd_code,dong,pnu,name,latitude,longitude,sale_type,section,sido,dong_count,units_le60,units_le85,units_le135,units_gt135').order('id').range(from,from+999);
 if(error)throw Error(error.message);
 for(const c of data){
  complexList.push(c);
  if(c.bjd_code&&c.dong)bjdByDong.set(`${c.bjd_code.slice(0,5)}:${c.dong}`,c.bjd_code);
  if(c.pnu&&!kaptByPnu.has(c.pnu))kaptByPnu.set(c.pnu,c.kapt_code);
  const key=`${c.bjd_code}:${normalizeName(c.name)}`;
  kaptByName.set(key,kaptByName.has(key)?null:c.kapt_code);   // ambiguous names never match
 }
 if(data.length<1000)break;
}
// The vworld 법정동 table (scripts/geo/dongs.mjs) is the main source; K-APT dong names fill gaps.
try{for(const [lawd,map] of Object.entries(JSON.parse(await readFile('data/geo/dongs.json','utf8')).table))for(const [umd,bjd] of Object.entries(map))bjdByDong.set(`${lawd}:${umd}`,bjd);}catch(e){if(e.code!=='ENOENT')throw e;}
const regionName=new Map(leafRegions(regionCatalog.codes).map(r=>[r.code,r.name]));
// Third rule: K-APT files many complexes under another lot (환지, a 대표지번) and a prefixed name
// ("당정한솔솔파크"), so a similar name within 500 m of the building's parcel (coords.mjs) or in the
// same 법정동 also matches when exactly one complex qualifies.
const placePoint=new Map();
for(let from=0;;from+=1000){
 const {data,error}=await supa.from('market_places').select('id,latitude,longitude').eq('kind','apt').not('latitude','is',null).order('id').range(from,from+999);
 if(error)throw Error(error.message);
 for(const p of data)placePoint.set(p.id,p);
 if(data.length<1000)break;
}
const metres=(a,b)=>111000*Math.hypot(a.latitude-b.latitude,(a.longitude-b.longitude)*Math.cos(a.latitude*Math.PI/180));
// Complexes by ~1 km grid cell and by 법정동.
const cellOf=(lat,lng)=>`${Math.floor(lat*100)}:${Math.floor(lng*100)}`;
const complexByCell=new Map(),complexByBjd=new Map();
const pushTo=(map,key,c)=>{const l=map.get(key);if(l)l.push(c);else map.set(key,[c]);};
for(const c of complexList){
 if(c.latitude!=null)pushTo(complexByCell,cellOf(c.latitude,c.longitude),c);
 if(c.bjd_code)pushTo(complexByBjd,c.bjd_code,c);
}
function nearKapt(id,bjd,name){
 const at=placePoint.get(id),hits=new Set();
 if(at)for(const dy of [-1,0,1])for(const dx of [-1,0,1]){
  for(const c of complexByCell.get(`${Math.floor(at.latitude*100)+dy}:${Math.floor(at.longitude*100)+dx}`)??[])
   if(metres(at,c)<=500&&similarName(name,c.name))hits.add(c.kapt_code);
 }
 for(const c of complexByBjd.get(bjd)??[])if(similarName(name,c.name))hits.add(c.kapt_code);
 return hits.size===1?[...hits][0]:null;
}
// kapt_match says which rule linked an apartment, or 'not_in_kapt' (mostly buildings under the
// ~150-household K-APT threshold).
function kaptLink(id,pnu,bjd,name){
 const byPnu=pnu&&kaptByPnu.get(pnu);if(byPnu)return {kapt_code:byPnu,kapt_match:'pnu'};
 const byName=bjd&&kaptByName.get(`${bjd}:${normalizeName(name)}`);if(byName)return {kapt_code:byName,kapt_match:'name'};
 const near=nearKapt(id,bjd,name);if(near)return {kapt_code:near,kapt_match:'near_name'};
 return {kapt_code:null,kapt_match:'not_in_kapt'};
}

// Places: every building with any trade in the warehouse; name/build year from its latest trade.
// placeNames keeps every name MOLIT used at the lot, for the complex-side pass below.
const places=new Map(),placeNames=new Map();
for(const r of wh.prepare(`select kind,lawd,umd,jibun,name,build_year,max(deal_date) d from trades
  where kind in (${KINDS}) and umd is not null and jibun is not null group by kind,lawd,umd,jibun,name`).iterate()){
 const id=placeId(r.kind,r.lawd,r.umd,r.jibun);
 if(r.kind==='apt')(placeNames.get(id)??placeNames.set(id,new Set()).get(id)).add(r.name);
 const prev=places.get(id);
 if(prev&&prev._d>=r.d)continue;
 const [sido,...rest]=(regionName.get(r.lawd)??'').split(' ');
 const bjd=bjdByDong.get(`${r.lawd}:${r.umd}`)??null;
 const pnu=jibunPnu(bjd,r.jibun);
 places.set(id,{id,kind:r.kind,lawd:r.lawd,sido:sido||null,sigungu:rest.join(' ')||null,umd:r.umd,jibun:r.jibun,bjd_code:bjd,pnu,
  name:r.name,build_year:r.build_year,...(r.kind==='apt'?kaptLink(id,pnu,bjd,r.name):{kapt_code:null,kapt_match:null}),refreshed_at:runAt,_d:r.d});
}

// Complex-side pass for complexes no building linked to. Buildings within 50 m of the complex
// (or on its lot) are candidates:
// - one whose MOLIT names include a similar name links to it; when that building already has
//   another kapt_code, K-APT has split one estate into two codes (신당남산타운(분양) ~ 남산타운)
//   or MOLIT files several complexes under one combined name, so the building gets an extra link
//   in market_place_complexes ('split'; a shared name part is enough there, see sharesNamePart);
// - otherwise, if exactly one candidate has no kapt_code, it is linked ('same_point').
// A building two complexes claim this way is left alone.
const SAME_POINT_M=50;
const placeCell=new Map(),placeByPnu=new Map();
for(const p of places.values()){
 if(p.kind!=='apt')continue;
 const at=placePoint.get(p.id);
 if(at)pushTo(placeCell,cellOf(at.latitude,at.longitude),p);
 if(p.pnu)pushTo(placeByPnu,p.pnu,p);
}
// Hand-checked pairs come first, so the complex-side pass below neither claims those buildings nor retries those complexes.
const manual=applyManualLinks(places,JSON.parse(await readFile(new URL('./manual-place-links.json',import.meta.url),'utf8')));
if(manual.missing.length)console.log(`manual links: buildings not found ${manual.missing.join(', ')}`);
const linkedKapt=new Set([...places.values()].map(p=>p.kapt_code).filter(Boolean).concat(manual.extra.map(l=>l.kapt_code)));
const primaryClaims=new Map(),extraLinks=[...manual.extra];
for(const c of complexList){
 if(linkedKapt.has(c.kapt_code))continue;
 const near=new Set(c.pnu?placeByPnu.get(c.pnu)??[]:[]);
 if(c.latitude!=null)for(const dy of [-1,0,1])for(const dx of [-1,0,1])
  for(const p of placeCell.get(`${Math.floor(c.latitude*100)+dy}:${Math.floor(c.longitude*100)+dx}`)??[])
   if(metres(placePoint.get(p.id),c)<=SAME_POINT_M)near.add(p);
 if(!near.size)continue;
 const names=p=>[...placeNames.get(p.id)??[]];
 let named=[...near].filter(p=>names(p).some(n=>similarName(n,c.name)));
 if(!named.length)named=[...near].filter(p=>p.kapt_code&&names(p).some(n=>sharesNamePart(n,c.name)));
 const free=(named.length?named:[...near]).filter(p=>!p.kapt_code);
 for(const p of named.filter(p=>p.kapt_code))extraLinks.push({place_id:p.id,kapt_code:c.kapt_code,kapt_match:'split'});
 if(free.length===1)pushTo(primaryClaims,free[0].id,c.kapt_code);
}
for(const [id,codes] of primaryClaims)if(codes.length===1)Object.assign(places.get(id),{kapt_code:codes[0],kapt_match:'same_point'});

const months=Array.from({length:36},(_,i)=>{const d=new Date(Date.now()+9*3600000);d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-35+i);return d.toISOString().slice(0,7);});

// Buildings several K-APT complexes share: their trades are assigned to complexes (shared-split.mjs).
// An assigned trade moves to a small place of its complex ('<building>:<kapt_code>', kapt_match
// 'shared_split'); what cannot be assigned stays on the building (links with kapt_match 'shared_lot').
// SHARED_SPLIT=off in .env.local turns this off, see shared-split-rollback.mjs.
const splitPlaces=new Map(),frozenPlaces=new Set(),frozenIds=new Set(),newShared=[],failedSplits=[];
if(process.env.SHARED_SPLIT!=='off'){
 const linksOf=new Map();
 const addLink=(id,k)=>{(linksOf.get(id)??linksOf.set(id,new Set()).get(id)).add(k);};
 for(const p of places.values())if(p.kind==='apt'&&p.kapt_code)addLink(p.id,p.kapt_code);
 for(const l of extraLinks)if(places.has(l.place_id))addLink(l.place_id,l.kapt_code);
 const shared=[...linksOf].filter(([,k])=>k.size>1);
 const info=new Map(complexList.map(c=>[c.kapt_code,c]));
 const codes=[...new Set(shared.flatMap(([,k])=>[...k]))].filter(k=>info.has(k));
 const buildings=new Map();
 const readAll=async(table,cols)=>{const out=[];for(let i=0;i<codes.length;i+=200)for(let from=0;;from+=1000){const {data,error}=await supa.from(table).select(cols).in('kapt_code',codes.slice(i,i+200)).order('kapt_code').range(from,from+999);if(error)throw Error(`${table}: ${error.message}`);out.push(...data);if(data.length<1000)break;}return out;};
 for(const b of await readAll('complex_buildings','kapt_code,dong_name,households,main_purpose')){if(!(b.households>0)&&!/아파트/.test(b.main_purpose??''))continue;(buildings.get(b.kapt_code)??buildings.set(b.kapt_code,[]).get(b.kapt_code)).push(b.dong_name);}
 const tradesAt=wh.prepare(`select key,name,kind,lawd,umd,jibun,area,floor,building,deal,deal_date,amount,deposit,monthly_rent,dealing,cancel_date,contract_type
  from trades where kind='apt' and lawd=? and umd=? and jibun=? and deal_date>=? and area is not null`);
 const known=new Set(JSON.parse(await readFile(new URL('./shared-places.json',import.meta.url),'utf8')));
 const saleOverrides=JSON.parse(await readFile(new URL('./shared-sale-overrides.json',import.meta.url),'utf8'));
 const oneComplex=new Set(JSON.parse(await readFile(new URL('./shared-one-complex.json',import.meta.url),'utf8')));
 for(const [id,kapts] of shared){
  const p=places.get(id);
  if(!known.has(id))newShared.push(id);
  const trades=tradesAt.all(p.lawd,p.umd,p.jibun,`${months[0]}-01`);
  let plan;
  try{plan=planPlaceSplit(id,[...kapts].map(k=>info.get(k)).filter(Boolean),trades,buildings,{asOne:oneComplex.has(id),override:saleOverrides[id]??null});}
  catch(e){
   // A building the rules fail on keeps yesterday's rows untouched: nothing here is written or removed.
   failedSplits.push(`${id}: ${e.message}`);frozenPlaces.add(id);for(const t of trades)frozenIds.add(t.key);places.delete(id);
   for(let i=extraLinks.length-1;i>=0;i--)if(extraLinks[i].place_id===id)extraLinks.splice(i,1);
   continue;
  }
  if(!plan)continue;
  splitPlaces.set(id,plan);
  Object.assign(p,{kapt_code:plan.primary,kapt_match:plan.primaryMatch},plan.parentName?{name:plan.parentName}:{});
  for(let i=extraLinks.length-1;i>=0;i--)if(extraLinks[i].place_id===id)extraLinks.splice(i,1);
  for(const k of plan.alsoLinked)extraLinks.push({place_id:id,kapt_code:k,kapt_match:'shared_lot'});
  for(const c of plan.children){const child=childPlaceId(id,c.kapt_code);places.set(child,{...p,id:child,name:c.name,kapt_code:c.kapt_code,kapt_match:'shared_split'});}
 }
 console.log(`shared buildings ${shared.length}, split ${splitPlaces.size}, small places ${[...splitPlaces.values()].reduce((a,s)=>a+s.children.length,0)}`);
}

// Complexes whose sales MOLIT files as commercial (집합, nrgSale): they get an apartment place of their own.
{
 const q=wh.prepare(`select key,name,area,floor,building,deal,deal_date,amount,deposit,monthly_rent,dealing,cancel_date,contract_type
  from trades where kind='nrg' and lawd=? and umd=? and jibun=? and deal_date>=? and area is not null`);
 for(const m of JSON.parse(await readFile(new URL('./nrg-as-apt.json',import.meta.url),'utf8'))){
  const id=placeId('apt',m.lawd,m.umd,m.jibun),plan=nrgSalesPlan(id,m.kapt_code,q.all(m.lawd,m.umd,m.jibun,`${months[0]}-01`),m.minArea);
  const c=complexList.find(x=>x.kapt_code===m.kapt_code);
  if(!plan||!c)continue;
  const [sido,...rest]=(regionName.get(m.lawd)??'').split(' ');
  const bjd=bjdByDong.get(`${m.lawd}:${m.umd}`)??null;
  places.set(id,{id,kind:'apt',lawd:m.lawd,sido:sido||null,sigungu:rest.join(' ')||null,umd:m.umd,jibun:m.jibun,bjd_code:bjd,pnu:jibunPnu(bjd,m.jibun),name:c.name,build_year:m.build_year??null,kapt_code:m.kapt_code,kapt_match:'manual',refreshed_at:runAt});
  splitPlaces.set(id,plan);
 }
}

// Stats and 전월세 contracts over the last 12 months, streamed in building+area order.
const stats=[],sales=[],rents=[];
let group=[],groupKey=null;
const flush=()=>{if(!group.length)return;const [pid,areaType]=groupKey.split('|');
 // kind and region copied from the place so screens can filter without a join.
 const place=places.get(pid);
 stats.push({place_id:pid,area_type:Number(areaType),kind:place?.kind??null,sido:place?.sido??null,sigungu:place?.sigungu??null,...areaStats(group),...saleBasis(group,start,end),history:null,period_start:start,period_end:end,refreshed_at:runAt});group=[];};
for(const t of wh.prepare(`select key,kind,lawd,umd,jibun,area,floor,building,deal,deal_date,amount,deposit,monthly_rent,dealing,cancel_date,contract_type
  from trades where kind in (${KINDS}) and deal_date>=? and umd is not null and jibun is not null and area is not null order by kind,lawd,umd,jibun,cast(area as integer)`).iterate(start)){
 const pid=placeId(t.kind,t.lawd,t.umd,t.jibun),areaType=Math.floor(t.area),key=`${pid}|${areaType}`;
 if(splitPlaces.has(pid)||frozenPlaces.has(pid))continue;
 if(key!==groupKey){flush();groupKey=key;}
 group.push(t);
 if(t.deal==='rent')rents.push({id:t.key,place_id:pid,area:t.area,area_type:areaType,floor:t.floor,deal_date:t.deal_date,deposit:t.deposit,monthly_rent:t.monthly_rent??0,contract_type:t.contract_type||null,cancelled:!!t.cancel_date});
}
flush();

// 36-month chart history per building+평형, attached to the stats rows that exist, and the
// representative sale price (saleBasis) from the same 36 months.
const statByKey=new Map(stats.map(r=>[`${r.place_id}|${r.area_type}`,r]));
let hGroup=[],hKey=null;
// An apartment 평형 with sales in the 36 months but no trade in the 12 months gets a row too
// (request 16): its 12-month columns stay empty (0 or null) and only sale_basis_* (the 36-month mean) is set.
const olderRow=(pid,areaType,place)=>({place_id:pid,area_type:Number(areaType),kind:place?.kind??null,sido:place?.sido??null,sigungu:place?.sigungu??null,...areaStats([]),history:null,period_start:start,period_end:end,refreshed_at:runAt});
let olderRows=0;
const hFlush=()=>{
 let row=statByKey.get(hKey);
 if(!row&&hGroup.length&&hKey.startsWith('apt:')&&hGroup.some(validSale)){const [pid,areaType]=hKey.split('|');row=olderRow(pid,areaType,places.get(pid));stats.push(row);olderRows++;}
 if(row&&hGroup.length){row.history=monthlyHistory(hGroup,months,row.jeonse_basis);Object.assign(row,saleBasis(hGroup,start,end));}
 hGroup=[];
};
for(const t of wh.prepare(`select key,kind,lawd,umd,jibun,area,floor,building,deal,deal_date,amount,deposit,monthly_rent,dealing,cancel_date,contract_type
  from trades where kind in (${KINDS}) and deal_date>=? and umd is not null and jibun is not null and area is not null order by kind,lawd,umd,jibun,cast(area as integer)`).iterate(`${months[0]}-01`)){
 const key=`${placeId(t.kind,t.lawd,t.umd,t.jibun)}|${Math.floor(t.area)}`;
 if(splitPlaces.has(key.split('|')[0])||frozenPlaces.has(key.split('|')[0]))continue;
 if(key!==hKey){hFlush();hKey=key;}
 hGroup.push(t);
 // Sales list: the same 36 months as the chart.
 if(t.deal==='sale'&&t.amount!=null)sales.push({id:t.key,place_id:key.split('|')[0],area:t.area,area_type:Math.floor(t.area),floor:t.floor,building:t.building,deal_date:t.deal_date,amount:t.amount,direct:t.dealing==='직거래',cancelled:!!t.cancel_date});
}
hFlush();

// The trades of split buildings, now each on its final place. Same rows as the streams above.
const splitIds=new Set();
for(const plan of splitPlaces.values()){
 const groups=new Map();
 for(const r of plan.rows){const key=`${r.place_id}|${Math.floor(r.t.area)}`;(groups.get(key)??groups.set(key,[]).get(key)).push(r);}
 for(const [key,g] of groups){
  const [pid,areaType]=key.split('|'),place=places.get(pid),all=g.filter(r=>!r.common).map(r=>r.t),period=all.filter(t=>t.deal_date>=start);
  if(period.length){const row={place_id:pid,area_type:Number(areaType),kind:place.kind,sido:place.sido,sigungu:place.sigungu,...areaStats(period),...saleBasis(all,start,end),history:null,period_start:start,period_end:end,refreshed_at:runAt};row.history=monthlyHistory(all,months,row.jeonse_basis);stats.push(row);}
  else if(place.kind==='apt'&&all.some(validSale)){const row={...olderRow(pid,areaType,place),...saleBasis(all,start,end)};row.history=monthlyHistory(all,months,row.jeonse_basis);stats.push(row);olderRows++;}
  for(const {t,id,statOnly} of g){
   if(statOnly)continue;
   if(t.deal==='rent'&&t.deal_date>=start){rents.push({id,place_id:pid,area:t.area,area_type:Number(areaType),floor:t.floor,deal_date:t.deal_date,deposit:t.deposit,monthly_rent:t.monthly_rent??0,contract_type:t.contract_type||null,cancelled:!!t.cancel_date});splitIds.add(id);}
   if(t.deal==='sale'&&t.amount!=null){sales.push({id,place_id:pid,area:t.area,area_type:Number(areaType),floor:t.floor,building:t.building,deal_date:t.deal_date,amount:t.amount,direct:t.dealing==='직거래',cancelled:!!t.cancel_date});splitIds.add(id);}
  }
 }
}

// 토지·상업업무용·단독다가구 sales (36 months), by 법정동; MOLIT masks most of their lot numbers.
const COMMERCIAL_KIND={land:'land',nrg:'commercial',sh:'house'};
const commercial=[];
for(const t of wh.prepare(`select key,kind,lawd,umd,jibun,use_type,house_type,zone,land_area,building_area,total_floor_area,floor,build_year,building_type,share,deal_date,amount,dealing,cancel_date
  from trades where kind in ('land','nrg','sh') and deal='sale' and deal_date>=? and amount is not null`).iterate(`${months[0]}-01`)){
 const [sido,...rest]=(regionName.get(t.lawd)??'').split(' ');
 commercial.push({id:t.key,kind:COMMERCIAL_KIND[t.kind],lawd:t.lawd,sido:sido||null,sigungu:rest.join(' ')||null,umd:t.umd,jibun:t.jibun,
  use_type:t.use_type||t.house_type||null,zone:t.zone||null,land_area:t.land_area,building_area:t.building_area,total_floor_area:t.total_floor_area,
  floor:t.floor,build_year:t.build_year,building_type:t.building_type||null,share:t.share==='지분',deal_date:t.deal_date,amount:t.amount,
  direct:t.dealing==='직거래',cancelled:!!t.cancel_date});
}

// 분양권·입주권 전매 (last 12 months), linked to a complex by lot, name or a nearby similar name.
const presale=[],presaleLink=new Map();
for(const t of wh.prepare(`select key,lawd,umd,jibun,name,area,floor,deal_date,amount,ownership,dealing,cancel_date
  from trades where kind='silv' and deal_date>=? and amount is not null`).iterate(start)){
 const [sido,...rest]=(regionName.get(t.lawd)??'').split(' ');
 const bjd=bjdByDong.get(`${t.lawd}:${t.umd}`)??null,pnu=jibunPnu(bjd,t.jibun);
 const lk=`${t.lawd}|${t.umd}|${t.jibun}|${t.name}`;
 if(!presaleLink.has(lk)){const l=kaptLink(null,pnu,bjd,t.name);presaleLink.set(lk,l.kapt_code?l:{kapt_code:null,kapt_match:null});}
 presale.push({id:t.key,...presaleLink.get(lk),lawd:t.lawd,sido:sido||null,sigungu:rest.join(' ')||null,umd:t.umd,jibun:t.jibun,bjd_code:bjd,pnu,
  name:t.name,area:t.area,area_type:t.area==null?null:Math.floor(t.area),floor:t.floor,deal_date:t.deal_date,amount:t.amount,
  ownership:t.ownership==='입'?'입주권':'분양권',   // MOLIT files 입주권 as '입' and leaves 분양권 blank
  direct:t.dealing==='직거래',cancelled:!!t.cancel_date});
}

const placeRows=[...places.values()].map(({_d,...p})=>p);
const matched=placeRows.filter(p=>p.kapt_code).length;
// Every building ↔ complex link: each building's own kapt_code plus the extra 'split' links.
const linkRows=uniqueLinks([...placeRows.filter(p=>p.kapt_code),...extraLinks.map(l=>({id:l.place_id,...l}))]
 .map(p=>({place_id:p.id,kapt_code:p.kapt_code,kapt_match:p.kapt_match,refreshed_at:runAt})));
{const linked=new Set(linkRows.map(l=>l.kapt_code)),withPresale=new Set(presale.map(t=>t.kapt_code).filter(Boolean));
 const open=complexList.filter(c=>c.sale_type!=='임대'&&!linked.has(c.kapt_code));
 console.log(`complex links ${linkRows.length} (split ${extraLinks.length}); complexes without a building (임대 excluded) ${open.length}, of which with 분양권 trades ${open.filter(c=>withPresale.has(c.kapt_code)).length}`);
 console.log(`presale ${presale.length} (linked ${presale.filter(t=>t.kapt_code).length})`);
 // The open list, with the nearest apt buildings, for checking what the rules still miss.
 await writeJson('data/molit/unlinked-complexes.json',open.map(c=>({kapt_code:c.kapt_code,name:c.name,sale_type:c.sale_type,
  presale:withPresale.has(c.kapt_code),near:c.latitude==null?null:[...placePoint.values()].filter(p=>places.has(p.id)&&Math.abs(p.latitude-c.latitude)<0.003&&Math.abs(p.longitude-c.longitude)<0.004)
   .map(p=>({d:Math.round(metres(p,c)),name:places.get(p.id).name,kapt:places.get(p.id).kapt_code})).sort((x,y)=>x.d-y.d).slice(0,3)})));}
console.log('kapt_match',JSON.stringify(placeRows.reduce((m,p)=>(p.kapt_match&&(m[p.kapt_match]=(m[p.kapt_match]??0)+1),m),{})));
console.log(`places ${placeRows.length} (K-APT matched ${matched} of ${placeRows.filter(p=>p.kind==='apt').length} apt), area stats ${stats.length} (36-month-only apt ${olderRows}), sales ${sales.length}, rents ${rents.length}, commercial ${commercial.length}, period ${start}..${end}`);

// Batches of 500 with up to 3 tries: a busy free-tier DB occasionally times out one batch.
async function upsert(table,rows,onConflict){
 for(let i=0;i<rows.length;i+=500){
  for(let attempt=1;;attempt++){
   const {error}=await supa.from(table).upsert(rows.slice(i,i+500),{onConflict});
   if(!error)break;
   if(attempt>=3)throw Error(`${table}: ${error.message}`);
   await new Promise(r=>setTimeout(r,5000*attempt));
  }
 }
}
// Places and stats change little from day to day, so only new or changed rows are written
// (compared by a content digest) and rows that disappeared are deleted. Rewriting every row
// daily doubled these tables on the free-tier DB.
// The rolling window dates change daily for every row, so they stay out of the digest.
const digestOf=row=>{const {refreshed_at:_r,period_start:_s,period_end:_e,...rest}=row;return createHash('sha1').update(JSON.stringify(rest)).digest('hex').slice(0,16);};
async function existingDigests(table,cols){
 const out=new Map();
 for(let from=0;;from+=1000){
  const {data,error}=await supa.from(table).select([...cols,'digest'].join(',')).order(cols[0]).order(cols.at(-1)).range(from,from+999);
  if(error)throw Error(`${table} digests: ${error.message}`);
  for(const r of data)out.set(cols.map(c=>r[c]).join('|'),r.digest);
  if(data.length<1000)break;
 }
 return out;
}
// What was last published is kept locally, so a daily run doesn't read ~430k digests back from the
// DB just to compare; --full (or a missing cache file) reads them from the DB instead.
const digestCachePath=table=>`data/molit/published-${table}.json`;
async function knownDigests(table,cols){
 if(!process.argv.includes('--full')){try{return new Map(Object.entries(JSON.parse(await readFile(digestCachePath(table),'utf8'))));}catch(e){if(e.code!=='ENOENT')throw e;}}
 return existingDigests(table,cols);
}
// Every table is planned before anything is written, so a run that would delete far more than usual
// (an empty or partial warehouse) stops with nothing changed (scripts/daily/delete-guard.mjs).
async function planTable(table,rows,cols){
 const have=await knownDigests(table,cols);
 const keyOf=r=>cols.map(c=>r[c]).join('|');
 const current=new Set(rows.map(keyOf));
 const frozen=k=>{const id=k.split('|')[0];return [...frozenPlaces].some(f=>id===f||id.startsWith(`${f}:`));};
 const gone=[...have.keys()].filter(k=>!current.has(k)&&!frozen(k));
 const changed=rows.filter(r=>have.get(keyOf(r))!==digestOf(r)).length;
 return {name:table,removed:gone.length,total:have.size,changed,apply:()=>applyTable(table,rows,cols,have,keyOf,gone)};
}
async function applyTable(table,rows,cols,have,keyOf,gone){
 const changed=rows.map(r=>({...r,digest:digestOf(r)})).filter(r=>have.get(keyOf(r))!==r.digest);
 await upsert(table,changed,cols.join(','));
 for(let i=0;i<gone.length;i+=200){
  const batch=gone.slice(i,i+200).map(k=>k.split('|'));
  const del=cols.length===1?supa.from(table).delete().in(cols[0],batch.map(b=>b[0]))
   :supa.from(table).delete().or(batch.map(b=>`and(${cols.map((c,j)=>`${c}.eq."${b[j]}"`).join(',')})`).join(','));
  const {error}=await del;if(error)throw Error(`${table} delete: ${error.message}`);
 }
 await writeJson(digestCachePath(table),Object.fromEntries(rows.map(r=>[keyOf(r),digestOf(r)])));
 console.log(`${table}: ${changed.length} written, ${gone.length} removed, ${rows.length-changed.length} unchanged`);
}

// Trade rows are immutable (id = content hash), so they are synced by difference. Daily runs only
// compare the months MOLIT reloads (recent RECHECK_MONTHS) and drop rows that left the window;
// --full compares everything (first load, or after changing a window).
const full=process.argv.includes('--full');
const RECHECK_MONTHS=3;   // MOLIT reloads at most the last 3 months
const recheckFrom=(()=>{const d=new Date(Date.now()+9*3600000);d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-RECHECK_MONTHS);return d.toISOString().slice(0,10);})();
// The ids published for the recheck window are kept locally ({id: deal_date}), so a daily run
// doesn't page hundreds of thousands of ids back out of the DB (those reads held the DB for
// seconds and made the site's queries time out). --full or a missing cache reads the DB.
async function planById(table,rows,windowStart){
 const idCachePath=`data/molit/published-ids-${table}.json`;
 let cached=null;
 if(!full){try{cached=JSON.parse(await readFile(idCachePath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}}
 // Without a cache (a new table's first load) the whole window is compared, as with --full.
 const from=cached?recheckFrom:windowStart;
 let existing=cached&&new Set(Object.entries(cached).filter(([,d])=>d>=from).map(([id])=>id));
 if(!existing){
  existing=new Set();
  for(let after='';;){
   const {data,error}=await supa.from(table).select('id').gte('deal_date',from).gt('id',after).order('id').limit(1000);
   if(error)throw Error(`${table} ids: ${error.message}`);
   for(const r of data)existing.add(r.id);
   if(data.length<1000)break;after=data.at(-1).id;
  }
 }
 const mine=rows.filter(r=>r.deal_date>=from);
 const current=new Set(mine.map(r=>r.id));
 // Trades of split buildings can change place when the assignment changes; ids alone would not show it.
 const placePath=`data/molit/published-split-${table}.json`;
 let lastPlace={};try{lastPlace=JSON.parse(await readFile(placePath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const splitRows=rows.filter(r=>splitIds.has(r.id));
 const moved=splitRows.filter(r=>lastPlace[r.id]!==r.place_id);
 for(const [id,place] of Object.entries(lastPlace))if([...frozenPlaces].some(f=>place===f||place.startsWith(`${f}:`)))frozenIds.add(id);
 const added=mine.filter(r=>!existing.has(r.id)),gone=[...existing].filter(id=>!current.has(id)&&!frozenIds.has(id));
 // Rows older than the window are expired; measured against the whole table, since a wrong window
 // start (from a partial warehouse) would expire most of it.
 const head=q=>q.then(({count,error})=>{if(error)throw Error(`${table} count: ${error.message}`);return count??0;});
 const [expiring,total]=await Promise.all([head(supa.from(table).select('id',{count:'exact',head:true}).lt('deal_date',windowStart)),head(supa.from(table).select('id',{count:'exact',head:true}))]);
 return [
  {name:`${table} (최근 ${cached?RECHECK_MONTHS+'개월':'전체'})`,removed:gone.length,total:existing.size,added:added.length,moved:moved.length,apply:()=>applyById(table,rows,windowStart,added,gone,moved,placePath,splitRows)},
  {name:`${table} 기간 만료`,removed:expiring,total},
 ];
}
async function applyById(table,rows,windowStart,added,gone,moved=[],placePath=null,splitRows=[]){
 const idCachePath=`data/molit/published-ids-${table}.json`;
 for(let i=0;i<moved.length;i+=1000){
  for(let attempt=1;;attempt++){
   const {error}=await supa.from(table).upsert(moved.slice(i,i+1000),{onConflict:'id'});
   if(!error)break;
   if(attempt>=3)throw Error(`${table} move: ${error.message}`);
   await new Promise(r=>setTimeout(r,5000*attempt));
  }
 }
 if(placePath&&splitRows.length)await writeJson(placePath,Object.fromEntries(splitRows.map(r=>[r.id,r.place_id])));
 for(let i=0;i<added.length;i+=1000){
  for(let attempt=1;;attempt++){
   const {error}=await supa.from(table).upsert(added.slice(i,i+1000),{onConflict:'id',ignoreDuplicates:true});
   if(!error)break;
   if(attempt>=3)throw Error(`${table} insert: ${error.message}`);
   await new Promise(r=>setTimeout(r,5000*attempt));
  }
 }
 for(let i=0;i<gone.length;i+=300){const {error}=await supa.from(table).delete().in('id',gone.slice(i,i+300));if(error)throw Error(`${table} delete: ${error.message}`);}
 const {error,count}=await supa.from(table).delete({count:'exact'}).lt('deal_date',windowStart);if(error)throw Error(`${table} expire: ${error.message}`);
 await writeJson(idCachePath,Object.fromEntries(rows.filter(r=>r.deal_date>=recheckFrom).map(r=>[r.id,r.deal_date])));
 console.log(`${table}: +${added.length} -${gone.length} expired ${count??0}`);
}
const salesStart=`${months[0]}-01`;
const plans=[
 await planTable('market_places',placeRows,['id']),
 await planTable('market_area_stats',stats,['place_id','area_type']),
 await planTable('market_place_complexes',linkRows,['place_id','kapt_code']),
 ...await planById('market_trades',sales,salesStart),
 ...await planById('market_rents',rents,start),
 ...await planById('market_commercial_trades',commercial,salesStart),
 ...await planById('market_presale_trades',presale,start),
];
console.log(JSON.stringify({plan:plans.map(({name,removed,total,changed,added,moved})=>({name,removed,total,changed,added,moved}))}));
if(dryRun){wh.close();process.exit(0);}
await guardDeletes('실거래 요약 업로드',plans);
for(const p of plans.slice(0,3))await p.apply();
{const {error}=await supa.from('market_summary_meta').upsert({id:1,published_at:runAt,period_start:start,period_end:end});if(error)throw Error(`meta: ${error.message}`);}
for(const p of plans.slice(3))if(p.apply)await p.apply();

// The daily note on the shared-building split, to the operator chat.
if(process.env.SHARED_SPLIT!=='off'){
 const commonRows=[...splitPlaces.values()].flatMap(p=>p.rows.filter(r=>r.common));
 const ok=!newShared.length&&!failedSplits.length;
 const line=[`번지 공유 거래 ${commonRows.length.toLocaleString('ko-KR')}건 단지 공통 반영 (규칙대로 처리됨)`,`새 번지 공유 건물 ${newShared.length}곳${newShared.length?`: ${newShared.slice(0,10).join(', ')}`:''}`,...(failedSplits.length?[`규칙 실패, 이전 값 유지 ${failedSplits.length}곳: ${failedSplits.slice(0,5).join(' / ')}`]:[])];
 console.log(line.join(' | '));
 if(process.env.TELEGRAM_CHAT_ID&&process.env.TELEGRAM_BOT_TOKEN){const r=await sendMessage(process.env.TELEGRAM_CHAT_ID,`<b>번지 공유 분리: ${ok?'정상':'확인 필요'}</b>\n${line.join('\n').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'})[c])}`);if(!r.ok)console.error('telegram failed',r.description);}
}

// Complexes newly without a building, to the operator chat, by name. Confirmed ones are in unlinked-confirmed.json.
{
 const confirmed=new Set(JSON.parse(await readFile(new URL('./unlinked-confirmed.json',import.meta.url),'utf8')).map(c=>c.kapt_code));
 const fresh=newUnlinked(complexList,new Set(linkRows.map(l=>l.kapt_code)),confirmed);
 console.log(`연결 안 된 새 단지 ${fresh.length}곳`);
 if(fresh.length&&process.env.TELEGRAM_CHAT_ID&&process.env.TELEGRAM_BOT_TOKEN){
  const names=fresh.slice(0,30).map(c=>c.name).join(', ').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'})[c]);
  const r=await sendMessage(process.env.TELEGRAM_CHAT_ID,`<b>연결 안 된 새 단지 ${fresh.length}곳</b>
${names}`);
  if(!r.ok)console.error('telegram failed',r.description);
 }
}

console.log('PUBLISHED');
wh.close();
