// 초등학교 통학구역 (vworld LT_C_DESCH, 교육부 학구도) + 학교 위치 (OpenStreetMap) → each complex's
// 배정 초등학교 and the straight-line distance to it. Pure functions only.
import {distanceM} from './stations-core.mjs';

export const ZONE_LAYER='LT_C_DESCH';
export const CAPITAL_SD=new Set(['11','41','28']);
export const BBOX='36.9,126.3,38.3,127.9';
// overpass-api.de times out on the whole area in one query, so schools come in four tiles.
export const SCHOOL_TILES=['36.9,126.3,37.45,127.1','36.9,127.1,37.45,127.9','37.45,126.3,38.3,127.1','37.45,127.1,38.3,127.9'];
export const schoolQuery=bbox=>`[out:json][timeout:180];nwr["amenity"="school"](${bbox});out center tags;`;

// "서울서이초통학구역" → ['서울서이초']. A 공동통학구역 runs its schools together
// ("팔탄초팔탄초대방분교공동통학구역"), and 초 also occurs inside names (인천초은초, 서울초당초), so it is
// split every way into parts ending in 초/분교 and the split matching most nearby schools wins.
export function zoneSchools(zoneName,shared=false,isKnown=()=>false){
 const s=String(zoneName??'').replace(/(공동)?통학구역$/,'').replace(/\s/g,'');
 if(!s)return [];
 if(!shared)return [s];
 const splits=[];
 const walk=(rest,parts)=>{
  if(!rest){if(parts.length>1)splits.push(parts);return;}
  for(let i=2;i<=rest.length;i++){const head=rest.slice(0,i);if(/(초|분교|분교장)$/.test(head))walk(rest.slice(i),[...parts,head]);}
 };
 walk(s,[]);
 if(!splits.length)return [s];
 const score=parts=>parts.filter(isKnown).length;
 return splits.sort((a,b)=>score(b)-score(a)||a.length-b.length)[0];
}
// "서울서이초등학교" → "서울서이초"; "팔탄초등학교대방분교장" → "팔탄초대방분교".
export const schoolShort=name=>String(name).replace(/\s/g,'').replace(/등학교/,'').replace(/분교장$/,'분교');
// Zone names often carry a city prefix the school's own name lacks (양주덕현초 ↔ 덕현초), or the reverse.
export function sameSchool(zonePart,osmName){
 const a=zonePart.replace(/분교장$/,'분교'),b=schoolShort(osmName);
 if(a===b)return true;
 const [long,short]=a.length>b.length?[a,b]:[b,a];
 return short.length>=3&&long.endsWith(short);
}

export function osmSchools(elements){
 const seen=new Set(),out=[];
 for(const e of elements){
  const key=`${e.type}/${e.id}`;if(seen.has(key))continue;seen.add(key);
  const name=e.tags?.name;const lat=e.center?.lat??e.lat,lon=e.center?.lon??e.lon;
  if(!name||!/초등학교/.test(name)||lat==null)continue;
  out.push({id:`osm:${key}`,name:name.trim(),lat,lon});
 }
 return out;
}

const ringContains=(ring,x,y)=>{let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;}return inside;};
export function polygonContains(geometry,lon,lat){
 const polys=geometry.type==='Polygon'?[geometry.coordinates]:geometry.type==='MultiPolygon'?geometry.coordinates:[];
 return polys.some(([outer,...holes])=>ringContains(outer,lon,lat)&&!holes.some(h=>ringContains(h,lon,lat)));
}
export function bbox(geometry){
 let b=[Infinity,Infinity,-Infinity,-Infinity];
 const walk=c=>{if(typeof c[0]==='number'){b=[Math.min(b[0],c[0]),Math.min(b[1],c[1]),Math.max(b[2],c[0]),Math.max(b[3],c[1])];}else c.forEach(walk);};
 walk(geometry.coordinates);return b;
}

// Zones with their schools located: a zone's school is the name match nearest the zone (within ~1.5 km
// of its box; schools sit on or just outside their own 학구 edge). Unlocated schools keep their name.
export function buildZones(features,schools){
 return features.filter(f=>CAPITAL_SD.has(f.properties.sd_cd)).map(f=>{
  const box=bbox(f.geometry),pad=0.015,cx=(box[0]+box[2])/2,cy=(box[1]+box[3])/2;
  const near=schools.filter(s=>s.lon>box[0]-pad&&s.lon<box[2]+pad&&s.lat>box[1]-pad&&s.lat<box[3]+pad);
  const shared=f.properties.hakgudo_gb==='1';
  const members=zoneSchools(f.properties.hakgudo_nm,shared,part=>near.some(s=>sameSchool(part,s.name))).map(part=>{
   const hit=near.filter(s=>sameSchool(part,s.name)).sort((a,b)=>distanceM({lat:cy,lon:cx},a)-distanceM({lat:cy,lon:cx},b))[0];
   return hit?{name:hit.name,lat:hit.lat,lon:hit.lon,osm_id:hit.id}:{name:part.replace(/초$/,'초등학교'),lat:null,lon:null,osm_id:null};
  });
  return {id:f.properties.hakgudo_id,name:f.properties.hakgudo_nm,shared,base_dt:f.properties.base_dt,box,geometry:f.geometry,schools:members};
 });
}

// The zone a complex sits in, and its school (nearest one when the zone is shared).
export function assignSchool(point,zones){
 const zone=zones.find(z=>point.lon>=z.box[0]&&point.lon<=z.box[2]&&point.lat>=z.box[1]&&point.lat<=z.box[3]&&polygonContains(z.geometry,point.lon,point.lat));
 if(!zone)return null;
 const ranked=zone.schools.map(s=>({s,m:s.lat==null?null:Math.round(distanceM(point,s))})).sort((a,b)=>(a.m??Infinity)-(b.m??Infinity));
 return {
  elementary_school:ranked[0].s.name,elementary_school_m:ranked[0].m,
  elementary_zone_id:zone.id,elementary_zone_shared:zone.shared,
  elementary_zone_schools:zone.shared?zone.schools.map(s=>s.name):null,
 };
}
