// 전철역 of the enabled regions (OpenStreetMap, © OpenStreetMap contributors, ODbL) → stations and each
// complex's nearest two. Pure functions only. One Overpass query per OSM area (scripts/regions.json areas).
export const OVERPASS_URL='https://overpass-api.de/api/interpreter';
export const overpassQuery=bbox=>`[out:json][timeout:170];
relation["type"="route"]["route"~"^(subway|light_rail|train|monorail)$"](${bbox})->.r;.r out body;
node(r.r)->.n;.n out body;
(nwr["railway"="station"](${bbox});nwr["public_transport"="station"]["train"="yes"](${bbox});nwr["station"~"subway|light_rail"](${bbox}););out center tags;`;
// 서울·경기·인천 plus the ends of lines that leave it (천안·춘천 side stations are harmless).
export const OVERPASS_QUERY=overpassQuery('36.9,126.3,38.3,127.9');

// Route ref (or name prefix when a route has no ref) → the line name K-APT and the site use, per OSM area.
// Routes not listed (KTX, ITX, 무궁화, AREX 직통, airport shuttles, 월미바다열차) are not commuter lines.
// Outside the capital area the city goes in front ("부산 1호선"), so equal numbers never meet in one name.
// ⚠️ 광역시 refs and names are a first guess: check them against the Overpass answer before turning a region on.
const LINES={
 capital:{city:null,refs:{'1':'1호선','2':'2호선','3':'3호선','4':'4호선','5':'5호선','6':'6호선','7':'7호선','8':'8호선','9':'9호선',
  '수인·분당':'수인분당선','신분당':'신분당선','경의·중앙':'경의중앙선','경춘':'경춘선','경강':'경강선','서해':'서해선','공항철도':'공항철도',
  'GTX-A':'GTX-A','인천1':'인천1호선','I2':'인천2호선','U':'의정부경전철','용인':'용인에버라인','김포 골드라인':'김포골드라인','W':'우이신설선','Silim':'신림선'},
  names:[[/^의정부경전철/,'의정부경전철'],[/^우이신설선/,'우이신설선'],[/^김포 골드라인/,'김포골드라인'],[/^용인 경전철/,'용인에버라인'],[/신림선/,'신림선']]},
 // OSM tags 동해선 광역전철 ref "동해", 부산김해경전철 ref "BGL" and 대경선 ref "대경"; a ref that is not listed drops the route,
 // so the name rules below never saw them (2026-11-19: no 동해선 station anywhere, 울산 complexes 30-45 km from a station).
 '26':{city:'부산',refs:{'1':'1호선','2':'2호선','3':'3호선','4':'4호선','동해':'동해선','BGL':'김해경전철'},names:[[/^부산.?김해.?경전철/,'김해경전철'],[/^동해선/,'동해선']]},
 '27':{city:'대구',refs:{'1':'1호선','2':'2호선','3':'3호선','대경':'대경선'},names:[[/^대경선/,'대경선']]},
 '30':{city:'대전',refs:{'1':'1호선'},names:[]},
 '36':{city:'세종',refs:{},names:[]},
 '29':{city:'광주',refs:{'1':'1호선'},names:[]},
 '31':{city:'울산',refs:{'동해':'동해선'},names:[[/^동해선/,'동해선']]},
 // 도 (2026-11-20 경남·경북부터): 도시철도가 없어 역을 잡지 않는다. 김해경전철은 부산 노선 영역, 포항 동해선은 간선이라 뺀다.
 '48':{city:'경남',refs:{},names:[]},
 '47':{city:'경북',refs:{},names:[]},
};
const linesOfArea=area=>{
 const l=LINES[area];if(!l)throw Error(`NO_LINES:${area}`);
 const named=n=>l.city?`${l.city} ${n}`:n;
 return {refs:Object.fromEntries(Object.entries(l.refs).map(([k,v])=>[k,named(v)])),names:l.names.map(([re,n])=>[re,named(n)])};
};
export function lineOf(tags={},area='capital'){
 const {refs,names}=linesOfArea(area);
 if(tags.ref&&refs[tags.ref])return refs[tags.ref];
 if(tags.ref)return null;
 const name=tags['name:ko']??tags.name??'';
 return names.find(([re])=>re.test(name))?.[1]??null;
}

export function distanceM(a,b){
 const r=Math.PI/180,x=(b.lon-a.lon)*r*Math.cos((a.lat+b.lat)/2*r),y=(b.lat-a.lat)*r;
 return 6371000*Math.hypot(x,y);
}
// lineestate's rule: 직선거리 × 1.3 (road detour) at 67 m/min (4 km/h).
export const walkMinutes=m=>Math.max(1,Math.round(m*1.3/67));
const stationName=t=>(t['name:ko']??t.name??'').replace(/역$/,'').trim();

// Stop nodes of a route are often bare track nodes, so each stop is tied to the nearest station node
// (within 400 m). Some stations are drawn as areas (ways), which come with a centre point. Station
// points with one name within 600 m (환승역 drawn per line) become one station.
export function buildStations(elements,{stopRadius=400,mergeRadius=600,area='capital'}={}){
 const nodes=new Map();
 for(const e of elements)if(e.type==='node'){const p=nodes.get(e.id);if(!p||e.tags)nodes.set(e.id,e);}
 const isStation=t=>t&&(t.railway==='station'||t.public_transport==='station')&&stationName(t);
 const stationNodes=[...nodes.values()].filter(n=>isStation(n.tags)).map(n=>({...n,key:`node/${n.id}`}));
 for(const e of elements)if(e.type!=='node'&&e.center&&isStation(e.tags))stationNodes.push({...e,key:`${e.type}/${e.id}`,lat:e.center.lat,lon:e.center.lon});
 const linesOf=new Map(),sequences=[];let unmatchedStops=0;
 for(const r of elements){
  if(r.type!=='relation')continue;
  const line=lineOf(r.tags,area);if(!line)continue;
  const seq=[];sequences.push({line,keys:seq});
  for(const m of r.members??[]){
   if(m.type!=='node'||!/^stop/.test(m.role))continue;
   const stop=nodes.get(m.ref);if(!stop)continue;
   let best=null,bd=Infinity;
   for(const s of stationNodes){const d=distanceM(stop,s);if(d<bd){bd=d;best=s;}}
   if(!best||bd>stopRadius){unmatchedStops++;continue;}
   if(!linesOf.has(best.key))linesOf.set(best.key,new Set());
   linesOf.get(best.key).add(line);
   seq.push(best.key);
  }
 }
 const clusters=[];
 for(const n of stationNodes.filter(n=>linesOf.has(n.key)).sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0)){
  const name=stationName(n.tags);
  const c=clusters.find(c=>c.name===name&&c.nodes.some(o=>distanceM(o,n)<=mergeRadius));
  if(c){c.nodes.push(n);for(const l of linesOf.get(n.key))c.lines.add(l);}
  else clusters.push({name,nodes:[n],lines:new Set(linesOf.get(n.key))});
 }
 const clusterOf=new Map(clusters.flatMap(c=>c.nodes.map(n=>[n.key,`osm:${c.nodes[0].key}`])));
 const order=Object.values(linesOfArea(area).refs);
 const stations=clusters.map(c=>({
  id:`osm:${c.nodes[0].key}`,name:c.name,
  lines:[...c.lines].sort((a,b)=>order.indexOf(a)-order.indexOf(b)),
  latitude:+(c.nodes.reduce((s,n)=>s+n.lat,0)/c.nodes.length).toFixed(7),
  longitude:+(c.nodes.reduce((s,n)=>s+n.lon,0)/c.nodes.length).toFixed(7),
  points:c.nodes.map(n=>({lat:n.lat,lon:n.lon})),osm_ids:c.nodes.map(n=>n.key),
 }));
 // Each route's stops in order, as station ids (a stop repeated by platform+stop collapses).
 const routes=sequences.map(({line,keys})=>({line,stations:keys.map(k=>clusterOf.get(k)).filter((id,i,a)=>id&&id!==a[i-1])})).filter(r=>r.stations.length>1);
 return {stations,routes,unmatchedStops};
}

// The nearest distinct stations; distance is to the closest node of a 환승역.
export const rankStations=(point,stations,n=2)=>stations.map(s=>({s,m:Math.min(...s.points.map(p=>distanceM(point,p)))})).sort((a,b)=>a.m-b.m).slice(0,n);
export function nearestStations(point,stations){
 const ranked=rankStations(point,stations);
 const pick=r=>r?{name:r.s.name,lines:r.s.lines,m:Math.round(r.m),walk:walkMinutes(r.m)}:null;
 const [a,b]=ranked.map(pick);
 return {
  nearest_station_name:a?.name??null,nearest_station_lines:a?.lines??null,nearest_station_m:a?.m??null,nearest_station_walk_min:a?.walk??null,
  second_station_name:b?.name??null,second_station_lines:b?.lines??null,second_station_m:b?.m??null,second_station_walk_min:b?.walk??null,
 };
}

// The stations a complex may show as nearest and start a commute from: those its own area's lines reach
// (regions.json area; 부산 2호선 양산 and 울산 남창·서생 on 동해선 count), none for a 시군구 the region lists
// in noStationSigungu (대구 군위군: the nearest stations are 24-30 km away), all when the 시도 is unknown.
export function ownStations(stations,{region,sigungu,builtIn}){
 if(!region)return stations;
 if((region.noStationSigungu??[]).includes(sigungu))return [];
 return stations.filter(s=>builtIn.get(s.id)?.has(region.area));
}
