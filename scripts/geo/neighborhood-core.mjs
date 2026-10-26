// 동네 환경 per complex: 공원 거리·면적 and 대형마트·백화점 거리·개수 from OpenStreetMap (© OpenStreetMap
// contributors, ODbL); 종합병원·의원·학원 from 소상공인시장진흥공단 상가(상권)정보. Pure functions only.
import {distanceM} from './stations-core.mjs';

// overpass-api.de times out on the whole area with geometry, so parks come in the school tiles.
export const parkQuery=bbox=>`[out:json][timeout:180];nwr["leisure"="park"](${bbox});out geom tags;`;
export const martQuery=bbox=>`[out:json][timeout:180];nwr["shop"~"^(supermarket|department_store|mall)$"](${bbox});out center tags;`;

export const KIDS_PARK_M2=1500,PARK_RADIUS=500,MART_RADIUS=1000,MAX_SEARCH=3000;
// shop=supermarket is mostly 동네 마트 and SSM, so 대형마트·백화점 are picked by name or brand.
// 이마트24·이마트 에브리데이·홈플러스 익스프레스 are SSM / convenience stores.
// 하이웨이마트·조이마트 contain 이마트, so it must start a word.
const BIG=/(^|[^가-힣])이마트|e-?mart|홈플러스|homeplus|롯데마트|lotte ?mart|코스트코|costco|트레이더스|traders|메가마트|하나로클럽|빅마켓|백화점|department|갤러리아|galleria|ak플라자|ak ?plaza|뉴코아|newcore|스타필드|starfield|롯데몰|lotte ?mall|타임스퀘어|아이파크몰|현대아울렛|롯데아울렛|프리미엄 ?아울렛/i;
const SMALL=/이마트 ?24|emart ?24|에브리데이|everyday|익스프레스|express|면세|duty ?free|노브랜드|no ?brand/i;
export function isBigMart(tags={}){
 const name=[tags.name,tags['name:ko'],tags.brand,tags['brand:ko']].filter(Boolean).join(' ');
 return BIG.test(name)&&!SMALL.test(name);
}

// Local metres around a point, good to well under 1 % over a few km.
const project=(lat0,lon0)=>{const r=Math.PI/180,k=6371000*r,c=Math.cos(lat0*r);return (lat,lon)=>[(lon-lon0)*k*c,(lat-lat0)*k];};
const ringArea=xy=>{let s=0;for(let i=0,j=xy.length-1;i<xy.length;j=i++)s+=(xy[j][0]+xy[i][0])*(xy[j][1]-xy[i][1]);return Math.abs(s)/2;};

// Join a multipolygon's outer member ways (often split) into closed rings.
function joinRings(ways){
 const rings=[],open=ways.map(w=>w.slice()).filter(w=>w.length>1);
 while(open.length){
  let ring=open.shift();
  const same=(a,b)=>a.lat===b.lat&&a.lon===b.lon;
  for(let grown=true;grown&&!same(ring[0],ring.at(-1));){
   grown=false;
   for(let i=0;i<open.length;i++){
    const w=open[i],end=ring.at(-1);
    if(same(w[0],end))ring=ring.concat(w.slice(1));
    else if(same(w.at(-1),end))ring=ring.concat(w.slice(0,-1).reverse());
    else continue;
    open.splice(i,1);grown=true;break;
   }
  }
  if(ring.length>=4&&same(ring[0],ring.at(-1)))rings.push(ring);
 }
 return rings;
}

// Parks as outer rings ({lat,lon} points) with area. Holes are ignored (a pond inside a park still
// reads as park). Private parks (아파트 단지 안 조경 drawn as park) are left out.
export function osmParks(elements){
 const seen=new Set(),out=[];
 for(const e of elements){
  const t=e.tags??{};const key=`${e.type}/${e.id}`;
  if(seen.has(key)||t.leisure!=='park'||/^(private|no)$/.test(t.access??''))continue;
  seen.add(key);
  let rings=[];
  if(e.type==='way'&&e.geometry?.length>=4)rings=joinRings([e.geometry]);
  else if(e.type==='relation')rings=joinRings((e.members??[]).filter(m=>m.type==='way'&&m.role!=='inner'&&m.geometry).map(m=>m.geometry));
  if(!rings.length)continue;
  const lat0=rings[0][0].lat,lon0=rings[0][0].lon,p=project(lat0,lon0);
  const area=rings.reduce((s,r)=>s+ringArea(r.map(q=>p(q.lat,q.lon))),0);
  let s=90,w=180,n=-90,ea=-180;
  for(const r of rings)for(const q of r){if(q.lat<s)s=q.lat;if(q.lat>n)n=q.lat;if(q.lon<w)w=q.lon;if(q.lon>ea)ea=q.lon;}
  const name=(t['name:ko']??t.name??'').trim()||null;
  out.push({id:`osm:${key}`,name,area:Math.round(area),rings,bbox:[s,w,n,ea],kids:area<KIDS_PARK_M2||/어린이공원$/.test(name??'')});
 }
 return out;
}

export function osmMarts(elements){
 const out=[];
 for(const e of elements){
  const t=e.tags??{};const lat=e.lat??e.center?.lat,lon=e.lon??e.center?.lon;
  if(lat==null||!isBigMart(t))continue;
  // Some stores are named just "현대" with brand 현대백화점: the brand is the clearer label then.
  const own=(t['name:ko']??t.name??'').trim(),brand=(t['brand:ko']??t.brand??'').trim();
  const name=own&&!(brand.length>own.length&&brand.includes(own))?own:brand||own;
  // A store is often drawn twice (building + point, 본관 + 별관): one name within 300 m is one store.
  if(out.some(o=>o.name===name&&distanceM(o,{lat,lon})<300))continue;
  out.push({id:`osm:${e.type}/${e.id}`,name,lat,lon});
 }
 return out;
}

// Grid buckets of about 1 km, so each complex looks only at nearby features.
export function gridIndex(items,boxOf,cell=0.01){
 const cells=new Map(),k=(i,j)=>`${i},${j}`;
 for(const it of items){const [s,w,n,e]=boxOf(it);for(let i=Math.floor(s/cell);i<=Math.floor(n/cell);i++)for(let j=Math.floor(w/cell);j<=Math.floor(e/cell);j++){const c=k(i,j);if(!cells.has(c))cells.set(c,[]);cells.get(c).push(it);}}
 return (lat,lon,m)=>{
  const dl=m/111000+cell,dn=m/(111000*Math.cos(lat*Math.PI/180))+cell,seen=new Set(),out=[];
  for(let i=Math.floor((lat-dl)/cell);i<=Math.floor((lat+dl)/cell);i++)for(let j=Math.floor((lon-dn)/cell);j<=Math.floor((lon+dn)/cell);j++)for(const it of cells.get(k(i,j))??[])if(!seen.has(it)){seen.add(it);out.push(it);}
  return out;
 };
}

const inRing=(x,y,xy)=>{let inside=false;for(let i=0,j=xy.length-1;i<xy.length;j=i++){const [xi,yi]=xy[i],[xj,yj]=xy[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;}return inside;};
const segDist=(x,y,[ax,ay],[bx,by])=>{const dx=bx-ax,dy=by-ay,l=dx*dx+dy*dy;const t=l?Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/l)):0;return Math.hypot(x-ax-t*dx,y-ay-t*dy);};

// One complex: distance to the edge of each park (0 inside), 500 m 안 공원 면적 (park ground inside the
// circle, sampled on a 20 m grid so overlapping or duplicated parks count once).
// Unnamed parks (3,200 of the first nearest picks, mostly 단지 조경 or 완충녹지 drawn as park) count toward
// the area only, never as the nearest park or an 어린이공원.
export function neighborhoodFor(point,nearParks,nearMarts,{step=20}={}){
 const p=project(point.lat,point.lon);
 const parks=nearParks.map(k=>{
  const rings=k.rings.map(r=>r.map(q=>p(q.lat,q.lon)));
  let m=Infinity;
  if(rings.some(r=>inRing(0,0,r)))m=0;
  else for(const r of rings)for(let i=1;i<r.length;i++)m=Math.min(m,segDist(0,0,r[i-1],r[i]));
  return {k,rings,m};
 });
 const big=parks.filter(x=>x.k.name&&!x.k.kids&&x.m<=MAX_SEARCH).sort((a,b)=>a.m-b.m)[0];
 const inCircle=parks.filter(x=>x.m<=PARK_RADIUS);
 let hits=0;
 for(let x=-PARK_RADIUS;x<=PARK_RADIUS;x+=step)for(let y=-PARK_RADIUS;y<=PARK_RADIUS;y+=step){
  if(x*x+y*y>PARK_RADIUS*PARK_RADIUS)continue;
  if(inCircle.some(c=>c.rings.some(r=>inRing(x,y,r))))hits++;
 }
 const marts=nearMarts.map(s=>({s,m:distanceM(point,s)})).filter(x=>x.m<=MAX_SEARCH).sort((a,b)=>a.m-b.m);
 return {
  park_nearest_m:big?Math.round(big.m):null,park_nearest_name:big?.k.name??null,park_nearest_area_m2:big?.k.area??null,
  park_area_500m_m2:Math.round(hits*step*step/100)*100,
  kids_park_count_500m:inCircle.filter(x=>x.k.name&&x.k.kids).length,
  mart_nearest_m:marts[0]?Math.round(marts[0].m):null,mart_nearest_name:marts[0]?.s.name??null,
  mart_count_1km:marts.filter(x=>x.m<=MART_RADIUS).length,
 };
}

// 상가(상권)정보 (B553077 storeListInDong), fetched per 시도 and 업종 대분류: Q1 보건의료, P1 교육.
export const STORE_SIDO=['11','41','28'],STORE_GROUPS=['Q1','P1'];
export const GENERAL_HOSPITAL='Q10101',CLINIC=/^Q102/;
// 학원가 means school-subject academies: 입시·교과학원 and 외국어학원 (not 예체능, 운전, 자격증, 요가).
export const ACADEMY=new Set(['P10501','P10615']);
export const ACADEMY_NEAR=500,ACADEMY_FAR=1000,CLINIC_RADIUS=1000,HOSPITAL_SEARCH=10000;
// Keep only what the per-complex pass needs; the API sends ~40 fields per store.
export function storeRows(items){
 return items.filter(i=>i.lat!==''&&i.lon!==''&&i.lat!=null&&i.lon!=null).map(i=>({
  id:i.bizesId,name:[i.bizesNm,i.brchNm].filter(Boolean).join(' ').trim(),code:i.indsSclsCd,lat:+i.lat,lon:+i.lon,
 })).filter(s=>Number.isFinite(s.lat)&&Number.isFinite(s.lon));
}

// hospitals: the 종합병원 list (a few hundred, scanned whole); nearClinics/nearAcademies: candidates
// from gridIndex within 1 km.
export function servicesFor(point,hospitals,nearClinics,nearAcademies){
 let best=null,bm=Infinity;
 for(const h of hospitals){const m=distanceM(point,h);if(m<bm){bm=m;best=h;}}
 const within=(list,r)=>list.filter(s=>distanceM(point,s)<=r).length;
 return {
  general_hospital_m:best&&bm<=HOSPITAL_SEARCH?Math.round(bm):null,general_hospital_name:best&&bm<=HOSPITAL_SEARCH?best.name:null,
  clinic_count_1km:within(nearClinics,CLINIC_RADIUS),
  academy_count_500m:within(nearAcademies,ACADEMY_NEAR),academy_count_1km:within(nearAcademies,ACADEMY_FAR),
 };
}
