// 수도권 전철역 (OpenStreetMap, © OpenStreetMap contributors, ODbL) → stations and each complex's
// nearest two. Pure functions only.
export const OVERPASS_URL='https://overpass-api.de/api/interpreter';
// 서울·경기·인천 plus the ends of lines that leave it (천안·춘천 side stations are harmless).
const BBOX='36.9,126.3,38.3,127.9';
export const OVERPASS_QUERY=`[out:json][timeout:170];
relation["type"="route"]["route"~"^(subway|light_rail|train|monorail)$"](${BBOX})->.r;.r out body;
node(r.r)->.n;.n out body;
(nwr["railway"="station"](${BBOX});nwr["public_transport"="station"]["train"="yes"](${BBOX});nwr["station"~"subway|light_rail"](${BBOX}););out center tags;`;

// Route ref (or name prefix when a route has no ref) → the line name K-APT and the site use.
// Routes not listed (KTX, ITX, 무궁화, AREX 직통, airport shuttles, 월미바다열차) are not commuter lines.
const LINE_BY_REF={'1':'1호선','2':'2호선','3':'3호선','4':'4호선','5':'5호선','6':'6호선','7':'7호선','8':'8호선','9':'9호선',
 '수인·분당':'수인분당선','신분당':'신분당선','경의·중앙':'경의중앙선','경춘':'경춘선','경강':'경강선','서해':'서해선','공항철도':'공항철도',
 'GTX-A':'GTX-A','인천1':'인천1호선','I2':'인천2호선','U':'의정부경전철','용인':'용인에버라인','김포 골드라인':'김포골드라인','W':'우이신설선','Silim':'신림선'};
const LINE_BY_NAME=[[/^의정부경전철/,'의정부경전철'],[/^우이신설선/,'우이신설선'],[/^김포 골드라인/,'김포골드라인'],[/^용인 경전철/,'용인에버라인'],[/신림선/,'신림선']];
export function lineOf(tags={}){
 if(tags.ref&&LINE_BY_REF[tags.ref])return LINE_BY_REF[tags.ref];
 if(tags.ref)return null;
 const name=tags['name:ko']??tags.name??'';
 return LINE_BY_NAME.find(([re])=>re.test(name))?.[1]??null;
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
export function buildStations(elements,{stopRadius=400,mergeRadius=600}={}){
 const nodes=new Map();
 for(const e of elements)if(e.type==='node'){const p=nodes.get(e.id);if(!p||e.tags)nodes.set(e.id,e);}
 const isStation=t=>t&&(t.railway==='station'||t.public_transport==='station')&&stationName(t);
 const stationNodes=[...nodes.values()].filter(n=>isStation(n.tags)).map(n=>({...n,key:`node/${n.id}`}));
 for(const e of elements)if(e.type!=='node'&&e.center&&isStation(e.tags))stationNodes.push({...e,key:`${e.type}/${e.id}`,lat:e.center.lat,lon:e.center.lon});
 const linesOf=new Map();let unmatchedStops=0;
 for(const r of elements){
  if(r.type!=='relation')continue;
  const line=lineOf(r.tags);if(!line)continue;
  for(const m of r.members??[]){
   if(m.type!=='node'||!/^stop/.test(m.role))continue;
   const stop=nodes.get(m.ref);if(!stop)continue;
   let best=null,bd=Infinity;
   for(const s of stationNodes){const d=distanceM(stop,s);if(d<bd){bd=d;best=s;}}
   if(!best||bd>stopRadius){unmatchedStops++;continue;}
   if(!linesOf.has(best.key))linesOf.set(best.key,new Set());
   linesOf.get(best.key).add(line);
  }
 }
 const clusters=[];
 for(const n of stationNodes.filter(n=>linesOf.has(n.key)).sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0)){
  const name=stationName(n.tags);
  const c=clusters.find(c=>c.name===name&&c.nodes.some(o=>distanceM(o,n)<=mergeRadius));
  if(c){c.nodes.push(n);for(const l of linesOf.get(n.key))c.lines.add(l);}
  else clusters.push({name,nodes:[n],lines:new Set(linesOf.get(n.key))});
 }
 const order=Object.values(LINE_BY_REF);
 const stations=clusters.map(c=>({
  id:`osm:${c.nodes[0].key}`,name:c.name,
  lines:[...c.lines].sort((a,b)=>order.indexOf(a)-order.indexOf(b)),
  latitude:+(c.nodes.reduce((s,n)=>s+n.lat,0)/c.nodes.length).toFixed(7),
  longitude:+(c.nodes.reduce((s,n)=>s+n.lon,0)/c.nodes.length).toFixed(7),
  points:c.nodes.map(n=>({lat:n.lat,lon:n.lon})),osm_ids:c.nodes.map(n=>n.key),
 }));
 return {stations,unmatchedStops};
}

// The two nearest distinct stations; distance is to the closest node of a 환승역.
export function nearestStations(point,stations){
 const ranked=stations.map(s=>({s,m:Math.min(...s.points.map(p=>distanceM(point,p)))})).sort((a,b)=>a.m-b.m).slice(0,2);
 const pick=r=>r?{name:r.s.name,lines:r.s.lines,m:Math.round(r.m),walk:walkMinutes(r.m)}:null;
 const [a,b]=ranked.map(pick);
 return {
  nearest_station_name:a?.name??null,nearest_station_lines:a?.lines??null,nearest_station_m:a?.m??null,nearest_station_walk_min:a?.walk??null,
  second_station_name:b?.name??null,second_station_lines:b?.lines??null,second_station_m:b?.m??null,second_station_walk_min:b?.walk??null,
 };
}
