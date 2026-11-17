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
