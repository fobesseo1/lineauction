import test from 'node:test';
import assert from 'node:assert/strict';
import {lineOf,walkMinutes,buildStations,nearestStations} from './stations-core.mjs';

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
