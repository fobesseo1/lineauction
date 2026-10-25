// 단지 → 주요 업무지구 대중교통 시간 (추정, ±10분). Pure functions only.
// minutes = 집→역 도보 + 첫 대기 3 + 역 사이 이동 + 환승마다 5 + 도착역→목적지 도보 5.
// The graph has one point per (station, line); neighbours on a route are joined, and the lines of one
// station are joined by a transfer. A hop is a 30 s stop plus the distance at 54 km/h (1.6 min for the
// usual 1 km spacing). The flat 2 min per station first asked for ran 10-25 min long on trips across
// the region: checked against 카카오맵 for 28 complexes (2026-10-25, Sunday), 18 were within ±10 min with
// 2 min and 26 with this rule (mean +0.3 min). Express lines (GTX-A, 신분당선, 공항철도) use their own speed.
import {distanceM} from './stations-core.mjs';

export const FIRST_WAIT=3,TRANSFER=5,LAST_WALK=5,MAX_ORIGIN_M=2000;
// km per minute between stations, stops included, from 수서→동탄 19분, 강남→판교 16분, 서울역→김포공항 22분.
const EXPRESS_SPEED={'GTX-A':1.6,'신분당선':1.0,'공항철도':0.8};
const STOP_MIN=0.5,SPEED=0.9;
export const hopMinutes=(line,m)=>EXPRESS_SPEED[line]?Math.max(2,m/1000/EXPRESS_SPEED[line]):STOP_MIN+m/1000/SPEED;

// 송도 is the 국제업무지구 (인천1호선), not 수인분당선 송도역.
export const DESTINATIONS={
 여의도:['여의도'],강남:['강남'],광화문:['광화문','시청'],판교:['판교'],마곡:['마곡나루','마곡'],
 잠실:['잠실'],구로디지털단지:['구로디지털단지'],성수:['성수'],용산:['용산'],송도:['센트럴파크','인천대입구'],
};

// opts let a calibration run try other hop and transfer times.
export function buildGraph(stations,routes,{hop=hopMinutes,transfer=TRANSFER}={}){
 const byId=new Map(stations.map(s=>[s.id,s]));
 const edges=new Map();
 const add=(a,b,t,x)=>{if(!edges.has(a))edges.set(a,[]);const list=edges.get(a);const e=list.find(e=>e.to===b);if(e){if(t<e.t)e.t=t;}else list.push({to:b,t,x});};
 for(const r of routes){
  for(let i=1;i<r.stations.length;i++){
   const a=byId.get(r.stations[i-1]),b=byId.get(r.stations[i]);if(!a||!b)continue;
   const t=hop(r.line,distanceM({lat:a.latitude,lon:a.longitude},{lat:b.latitude,lon:b.longitude}));
   // Routes are drawn per direction; treat every hop as two-way so one-way gaps do not break paths.
   add(`${a.id}|${r.line}`,`${b.id}|${r.line}`,t,0);add(`${b.id}|${r.line}`,`${a.id}|${r.line}`,t,0);
  }
 }
 for(const s of stations)for(const l1 of s.lines)for(const l2 of s.lines)if(l1!==l2)add(`${s.id}|${l1}`,`${s.id}|${l2}`,transfer,1);
 return edges;
}

// Shortest time (then fewest transfers) from every (station, line) point to any of `targets`.
// Hops are symmetric, so running from the destination gives every origin at once.
export function fromDestination(edges,stations,targetIds){
 const best=new Map(),heap=[];
 const push=(k,t,x)=>{const b=best.get(k);if(b&&(b.t<t||(b.t===t&&b.x<=x)))return;best.set(k,{t,x});heap.push([t,x,k]);up(heap.length-1);};
 const less=(a,b)=>a[0]<b[0]||(a[0]===b[0]&&a[1]<b[1]);
 const up=i=>{while(i>0){const p=(i-1)>>1;if(!less(heap[i],heap[p]))break;[heap[i],heap[p]]=[heap[p],heap[i]];i=p;}};
 const down=i=>{for(;;){let m=i;const l=2*i+1,r=l+1;if(l<heap.length&&less(heap[l],heap[m]))m=l;if(r<heap.length&&less(heap[r],heap[m]))m=r;if(m===i)return;[heap[i],heap[m]]=[heap[m],heap[i]];i=m;}};
 const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){heap[0]=last;down(0);}return top;};
 for(const s of stations)if(targetIds.has(s.id))for(const l of s.lines)push(`${s.id}|${l}`,0,0);
 while(heap.length){
  const [t,x,k]=pop();const b=best.get(k);if(b.t<t||(b.t===t&&b.x<x))continue;
  for(const e of edges.get(k)??[])push(e.to,t+e.t,x+e.x);
 }
 // Per station: the best over its lines (boarding any line costs nothing extra).
 const perStation=new Map();
 for(const [k,v] of best){const id=k.slice(0,k.lastIndexOf('|'));const p=perStation.get(id);if(!p||v.t<p.t||(v.t===p.t&&v.x<p.x))perStation.set(id,v);}
 return perStation;
}

// origins: [{id, m}] — the complex's nearest two stations and the straight-line distance to each.
export function commuteFor(origins,perStation,walkMinutes){
 if(!origins.length||origins[0].m>MAX_ORIGIN_M)return null;
 let best=null;
 for(const o of origins){
  const ride=perStation.get(o.id);if(!ride)continue;
  // Already at the destination station: walk there, no wait.
  const minutes=walkMinutes(o.m)+(ride.t===0?0:FIRST_WAIT+ride.t)+LAST_WALK;
  if(!best||minutes<best.minutes||(minutes===best.minutes&&ride.x<best.transfers))best={minutes,transfers:ride.x,from:o.id};
 }
 return best&&{...best,minutes:Math.round(best.minutes)};
}
