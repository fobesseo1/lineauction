import test from 'node:test';
import assert from 'node:assert/strict';
import {lineOf,walkMinutes,buildStations,nearestStations,ownStations} from './stations-core.mjs';

test('lineOf maps commuter routes and drops intercity ones',()=>{
 assert.equal(lineOf({ref:'2'}),'2호선');
 assert.equal(lineOf({ref:'수인·분당'}),'수인분당선');
 assert.equal(lineOf({ref:'AREX'}),null);
 assert.equal(lineOf({name:'의정부경전철: 발곡 → 탑석'}),'의정부경전철');
 assert.equal(lineOf({name:'경부선 KTX: 서울 → 부산'}),null);
});

test('walkMinutes uses 1.3 detour at 67 m/min',()=>{
 assert.equal(walkMinutes(515),10);
 assert.equal(walkMinutes(10),1);
});

test('buildStations ties stops to stations, merges 환승역 and reads area stations',()=>{
 const els=[
  {type:'relation',tags:{ref:'2'},members:[{type:'node',ref:1,role:'stop'},{type:'node',ref:2,role:'stop'}]},
  {type:'relation',tags:{ref:'신분당'},members:[{type:'node',ref:3,role:'stop_exit_only'}]},
  {type:'relation',tags:{name:'KTX'},members:[{type:'node',ref:1,role:'stop'}]},
  {type:'node',id:1,lat:37.4979,lon:127.0276},
  {type:'node',id:2,lat:37.5100,lon:127.0600},
  {type:'node',id:3,lat:37.4960,lon:127.0285},
  {type:'node',id:10,lat:37.4980,lon:127.0277,tags:{railway:'station',name:'강남'}},
  {type:'node',id:11,lat:37.4962,lon:127.0284,tags:{railway:'station',name:'강남역'}},
  {type:'way',id:12,center:{lat:37.5101,lon:127.0601},tags:{railway:'station',name:'삼성'}},
  {type:'node',id:13,lat:37.6,lon:127.1,tags:{railway:'station',name:'무정차'}},
 ];
 const {stations,unmatchedStops}=buildStations(els);
 assert.equal(unmatchedStops,0);
 assert.deepEqual(stations.map(s=>[s.name,s.lines,s.osm_ids]),[['강남',['2호선','신분당선'],['node/10','node/11']],['삼성',['2호선'],['way/12']]]);
 const n=nearestStations({lat:37.4970,lon:127.0280},stations);
 assert.equal(n.nearest_station_name,'강남');assert.ok(n.nearest_station_m<100);
 assert.equal(n.second_station_name,'삼성');assert.equal(n.second_station_walk_min,walkMinutes(n.second_station_m));
});

test('lineOf reads the 광역시 refs OSM uses for 동해선, 부산김해경전철 and 대경선',()=>{
 assert.equal(lineOf({ref:'동해',name:'동해선 광역전철: 태화강 → 부전'},'26'),'부산 동해선');
 assert.equal(lineOf({ref:'동해'},'31'),'울산 동해선');
 assert.equal(lineOf({ref:'BGL'},'26'),'부산 김해경전철');
 assert.equal(lineOf({ref:'대경'},'27'),'대구 대경선');
 assert.equal(lineOf({ref:'2',name:'광주 도시철도 2호선 내선순환'},'29'),null);
});

test('ownStations keeps a complex to its own area, and gives none to a no-station 시군구',()=>{
 const st=id=>({id,name:id});
 const stations=[st('부전'),st('양산'),st('남창'),st('태화강'),st('반월당'),st('정평'),st('사곡'),st('반석'),st('강남'),st('부평')];
 const builtIn=new Map([['부전',['26']],['양산',['26']],['남창',['26','31']],['태화강',['31']],['반월당',['27']],['정평',['27']],['사곡',['27']],['반석',['30','36']],['강남',['capital']],['부평',['capital']]].map(([k,v])=>[k,new Set(v)]));
 const 대구={code:'27',area:'27',noStationSigungu:['군위군']};
 const ids=(region,sigungu)=>ownStations(stations,{region,sigungu,builtIn}).map(s=>s.id);
 assert.deepEqual(ids({code:'26',area:'26'},'해운대구'),['부전','양산','남창']);
 assert.deepEqual(ids({code:'31',area:'31'},'울주군'),['남창','태화강']);
 assert.deepEqual(ids(대구,'수성구'),['반월당','정평','사곡']);
 assert.deepEqual(ids(대구,'군위군'),[]);
 assert.deepEqual(ids({code:'36',area:'36'},null),['반석']);
 assert.deepEqual(ids({code:'41',area:'capital'},'성남시 분당구'),['강남','부평']);
 assert.equal(ownStations(stations,{region:undefined,sigungu:null,builtIn}).length,stations.length);
});

test('a province uses only the station areas its stationSigungu lists, and none elsewhere (2026-11-26 "B: 도시철도만")',()=>{
 const st=id=>({id,name:id});
 const stations=[st('김해시청'),st('양산'),st('영남대'),st('두정'),st('강남')];
 const builtIn=new Map([['김해시청',['26']],['양산',['26']],['영남대',['27']],['두정',['capital','44']],['강남',['capital']]].map(([k,v])=>[k,new Set(v)]));
 const ids=(region,sigungu)=>ownStations(stations,{region,sigungu,builtIn}).map(s=>s.id);
 const 경남={code:'48',area:'48',stationSigungu:{'김해시':['26'],'양산시':['26']}};
 assert.deepEqual(ids(경남,'김해시'),['김해시청','양산']);
 assert.deepEqual(ids(경남,'창원시 성산구'),[]);
 assert.deepEqual(ids({code:'44',area:'44',stationSigungu:{'아산시':['44']}},'아산시'),['두정']);
 assert.deepEqual(ids({code:'44',area:'44',stationSigungu:{'아산시':['44']}},'서산시'),[]);
 assert.deepEqual(ids({code:'43',area:'43',stationSigungu:{}},'청주시 흥덕구'),[]);
});
