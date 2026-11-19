// The one place that says which regions the data factory collects (scripts/regions.json).
// Everything here is derived from the enabled regions only, in file order (서울, 경기, 인천 today).
// Pure: no network, no DB.
import {readFileSync} from 'node:fs';

export const regionConfig=JSON.parse(readFileSync(new URL('./regions.json',import.meta.url),'utf8'));
export const ALL_REGIONS=regionConfig.regions;
export const ENABLED_REGIONS=ALL_REGIONS.filter(r=>r.enabled);

export const SIDO_NAMES=ENABLED_REGIONS.map(r=>r.name);
export const SIDO_CODES=ENABLED_REGIONS.map(r=>r.code);
export const SIDO_SHORTS=ENABLED_REGIONS.map(r=>r.short);
export const sidoByCode=Object.fromEntries(ENABLED_REGIONS.map(r=>[r.code,r.name]));

// A catalog name belongs to a 시도 when it is the 시도 itself (세종, no 시군구) or starts with "시도 ".
export const inSido=(name,sido)=>name===sido||String(name??'').startsWith(`${sido} `);
// An address (or catalog name) inside one of `sidoNames`.
export const inSidoList=(name,sidoNames=SIDO_NAMES)=>sidoNames.some(s=>inSido(String(name??'').trim(),s));
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// /^(서울특별시|경기도|인천광역시)\s/: an address that starts with an enabled 시도.
export const sidoPrefixPattern=(sidoNames=SIDO_NAMES)=>new RegExp(`^(${sidoNames.map(escape).join('|')})\\s`);
// Same, found anywhere in the text (Onbid titles carry the address in brackets).
export const sidoSearchPattern=(sidoNames=SIDO_NAMES)=>new RegExp(`(${sidoNames.map(escape).join('|')})\\s`);
// R-ONE names its regions by short name ("서울", "서울>강남>테헤란로").
export const shortPattern=(shorts=SIDO_SHORTS)=>new RegExp(`^(${shorts.map(escape).join('|')})(>|$)`);
// PostgREST `not in` list: ("서울특별시","경기도","인천광역시").
export const sidoInList=(sidoNames=SIDO_NAMES)=>`(${sidoNames.map(s=>`"${s}"`).join(',')})`;

// Partial regions (regions.json "partial": true) cover only their listed 시군구 of a larger 시도:
// 전남광주통합특별시 (2026-07-01) is collected as the old 광주 5개 구 only, not the old 전남 시·군.
// "oldNames" are earlier 시도 names still found in addresses (court registries keep "광주광역시 …").
const sigunguShort=r=>Object.keys(r.sigungu).map(k=>k.slice(r.name.length).trim()).filter(Boolean);
const namePattern=name=>new RegExp(`^${escape(name)}(\\s|$)`);
// An address (or "시도 시군구" pair) inside an enabled region; for a partial region its 시군구 must be
// one of the listed ones. Non-partial regions behave like sidoPrefixPattern / inSido.
export function inEnabledArea(address,regions=ENABLED_REGIONS){
 const a=String(address??'').trim();
 for(const r of regions){
  for(const name of [r.name,...(r.oldNames??[])]){
   if(!namePattern(name).test(a))continue;
   if(!r.partial)return true;
   const rest=a.slice(name.length).trim();
   return sigunguShort(r).some(s=>rest===s||rest.startsWith(`${s} `));
  }
 }
 return false;
}
// The 시도 name a site row should carry: an old name (court registries still write "광주광역시 …") becomes
// today's name ("전남광주통합특별시"); any other name is returned as it is.
export function currentSidoName(name,regions=ALL_REGIONS){
 const r=regions.find(r=>(r.oldNames??[]).includes(name));
 return r?r.name:name;
}
// 시도 code → the 시군구 codes (5 digits) kept, for partial regions only.
export const partialSigunguCodes=(regions=ENABLED_REGIONS)=>Object.fromEntries(regions.filter(r=>r.partial).map(r=>[r.code,new Set(Object.values(r.sigungu))]));
// K-APT list rows carry a 10-digit bjdCode: keep a row of a partial 시도 only inside its listed 시군구.
export function keepBjd(sidoCode,bjdCode,regions=ENABLED_REGIONS){
 const partial=partialSigunguCodes(regions)[sidoCode];
 if(!partial)return true;
 return /^\d{10}$/.test(bjdCode??'')&&partial.has(String(bjdCode).slice(0,5));
}

// 시군구 catalog in the shape court/regions.json used to have: {codes, aliases}.
export function catalogOf(regions=ENABLED_REGIONS){
 const src=regionConfig.sigunguSource;
 const aliases={};
 for(const r of regions){
  if(r.aliasesNote&&!aliases._note)aliases._note=r.aliasesNote;
  Object.assign(aliases,r.aliases??{});
 }
 return {sourceUrl:src.sourceUrl,observedAt:src.observedAt,method:src.method,
  codes:Object.assign({},...regions.map(r=>r.sigungu)),aliases};
}

// Court names of the enabled regions, in courts.json order.
export function enabledCourts(allCourts,regions=ENABLED_REGIONS){
 const mine=new Set(regions.flatMap(r=>r.courts));
 return allCourts.filter(c=>mine.has(c));
}
export const courtList=(regions=ENABLED_REGIONS)=>enabledCourts(JSON.parse(readFileSync(new URL('./court/courts.json',import.meta.url),'utf8')),regions);

// OSM areas (역·학교·공원·마트) of the enabled regions. The capital area keeps its old cache names
// (overpass.json, tile1.json …), other areas add their key (overpass-26.json, tile-26-1.json).
export function geoAreas(regions=ENABLED_REGIONS){
 const keys=[...new Set(regions.map(r=>r.area))];
 return keys.map(key=>{
  const a=regionConfig.areas[key];if(!a)throw Error(`NO_AREA:${key}`);
  const tag=key==='capital'?'':`-${key}`;
  return {key,tag,bbox:a.bbox,sido:regions.filter(r=>r.area===key).map(r=>r.code),
   tiles:a.tiles.map((bbox,i)=>({bbox,name:`${tag?`${tag.slice(1)}-`:''}${i+1}`}))};
 });
}
