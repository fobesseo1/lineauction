import test from 'node:test';
import assert from 'node:assert/strict';
import {zoneSchools,schoolShort,sameSchool,polygonContains,buildZones,assignSchool} from './schools-core.mjs';

test('zoneSchools keeps single zones whole and splits shared ones by known schools',()=>{
 assert.deepEqual(zoneSchools('인천초은초통학구역'),['인천초은초']);
 assert.deepEqual(zoneSchools('팔탄초팔탄초대방분교공동통학구역',true,p=>['팔탄초','팔탄초대방분교'].includes(p)),['팔탄초','팔탄초대방분교']);
 assert.deepEqual(zoneSchools('서울초당초서울창동초공동통학구역',true,p=>['서울초당초','서울창동초'].includes(p)),['서울초당초','서울창동초']);
});

test('sameSchool tolerates a city prefix on either side',()=>{
 assert.equal(schoolShort('팔탄초등학교 대방분교장'),'팔탄초대방분교');
 assert.ok(sameSchool('양주덕현초','덕현초등학교'));
 assert.ok(sameSchool('서이초','서울서이초등학교'));
 assert.ok(!sameSchool('서울서이초','서울서일초등학교'));
});

test('assignSchool finds the zone and the nearest school of a shared zone',()=>{
 const square=(x,y)=>({type:'Polygon',coordinates:[[[x,y],[x+0.01,y],[x+0.01,y+0.01],[x,y+0.01],[x,y]]]});
 assert.ok(polygonContains(square(127,37.5),127.005,37.505));
 assert.ok(!polygonContains(square(127,37.5),127.02,37.505));
 const features=[
  {properties:{hakgudo_id:'Z1',hakgudo_nm:'서울가초서울나라초공동통학구역',hakgudo_gb:'1',sd_cd:'11'},geometry:square(127,37.5)},
  {properties:{hakgudo_id:'Z2',hakgudo_nm:'강원다초통학구역',hakgudo_gb:'0',sd_cd:'51'},geometry:square(127.02,37.5)},
 ];
 const schools=[{id:'osm:node/1',name:'서울가초등학교',lat:37.501,lon:127.001},{id:'osm:node/2',name:'나라초등학교',lat:37.509,lon:127.009}];
 const zones=buildZones(features,schools);
 assert.equal(zones.length,1);
 const a=assignSchool({lat:37.508,lon:127.008},zones);
 assert.equal(a.elementary_school,'나라초등학교');assert.ok(a.elementary_school_m<200);
 assert.deepEqual(a.elementary_zone_schools,['서울가초등학교','나라초등학교']);
 assert.equal(assignSchool({lat:37.6,lon:127.1},zones),null);
});
