import test from 'node:test';
import assert from 'node:assert/strict';
import {isBigMart,osmParks,osmMarts,gridIndex,neighborhoodFor,storeRows,servicesFor} from './neighborhood-core.mjs';

// A square of about `m` metres a side, its south-west corner `dy` metres north of (37.5, 127).
const square=(id,dy,m,tags={leisure:'park'})=>{
 const lat=37.5+dy/111000,dl=m/111000,dn=m/(111000*Math.cos(37.5*Math.PI/180));
 return {type:'way',id,tags,geometry:[{lat,lon:127},{lat,lon:127+dn},{lat:lat+dl,lon:127+dn},{lat:lat+dl,lon:127},{lat,lon:127}]};
};

test('isBigMart keeps 대형마트·백화점 and drops SSM and convenience stores',()=>{
 assert.ok(isBigMart({name:'이마트 역삼점'}));
 assert.ok(isBigMart({name:'Homeplus',brand:'Homeplus'}));
 assert.ok(isBigMart({name:'현대백화점'}));
 assert.ok(!isBigMart({name:'홈플러스익스프레스대치역점'}));
 assert.ok(!isBigMart({name:'이마트24 대웅제약점'}));
 assert.ok(!isBigMart({name:'대치마트'}));
 assert.ok(!isBigMart({name:'하이웨이마트'}));
 assert.ok(!isBigMart({name:'Lotte Duty Free',shop:'department_store'}));
});

test('osmParks measures area, marks 어린이공원 and skips private parks',()=>{
 const parks=osmParks([square(1,0,100),square(2,0,30,{leisure:'park',name:'샘터어린이공원'}),square(3,0,100,{leisure:'park',access:'private'})]);
 assert.equal(parks.length,2);
 assert.ok(Math.abs(parks[0].area-10000)<100);
 assert.equal(parks[0].kids,false);
 assert.equal(parks[1].kids,true);
});

test('osmParks joins a multipolygon split into two outer ways',()=>{
 const g=square(9,0,100).geometry;
 const [park]=osmParks([{type:'relation',id:5,tags:{leisure:'park',name:'큰공원'},members:[{type:'way',role:'outer',geometry:g.slice(0,3)},{type:'way',role:'outer',geometry:g.slice(2).reverse()}]}]);
 assert.ok(Math.abs(park.area-10000)<100);
});

test('osmMarts drops a store drawn twice',()=>{
 const marts=osmMarts([{type:'node',id:1,lat:37.5,lon:127,tags:{shop:'supermarket',name:'이마트'}},{type:'way',id:2,center:{lat:37.5005,lon:127},tags:{shop:'supermarket',name:'이마트'}}]);
 assert.equal(marts.length,1);
});

test('neighborhoodFor: edge distance, 500 m area, kids parks and marts',()=>{
 // A 200 m park 300 m north, a 1 km park 800 m north (outside the circle), a small park, and a bigger
 // unnamed park 300 m south that is closer but counts toward the area only.
 const parks=osmParks([square(1,300,200,{leisure:'park',name:'근린'}),square(2,800,1000,{leisure:'park',name:'큰'}),square(3,-100,30,{leisure:'park',name:'샘터'}),square(4,-300,300)]);
 const marts=[{name:'이마트',lat:37.5+900/111000,lon:127},{name:'롯데마트',lat:37.5+2000/111000,lon:127}];
 const near=gridIndex(parks,p=>p.bbox);
 const r=neighborhoodFor({lat:37.5,lon:127},near(37.5,127,3000),marts);
 assert.equal(r.park_nearest_name,'근린');
 assert.ok(Math.abs(r.park_nearest_m-300)<=2);
 assert.equal(r.kids_park_count_500m,1);
 // About 200×200 north, the small park, and all 300×300 of the unnamed park.
 assert.ok(r.park_area_500m_m2>=125000&&r.park_area_500m_m2<=138000,String(r.park_area_500m_m2));
 assert.equal(r.mart_nearest_name,'이마트');
 assert.equal(r.mart_count_1km,1);
 // Inside a park the distance is 0.
 assert.equal(neighborhoodFor({lat:37.5+350/111000,lon:127.0005},parks,[]).park_nearest_m,0);
});

test('osmMarts labels a store named only by its brand prefix with the brand',()=>{
 const [m]=osmMarts([{type:'way',id:1,center:{lat:37.5,lon:127},tags:{shop:'department_store',name:'현대',brand:'현대백화점'}}]);
 assert.equal(m.name,'현대백화점');
});

test('storeRows keeps id, name with branch, 소분류 and a numeric point',()=>{
 assert.deepEqual(storeRows([{bizesId:'A',bizesNm:'서울대학교병원',brchNm:'',indsSclsCd:'Q10101',lat:'37.58',lon:'127.0'},{bizesId:'B',bizesNm:'x',lat:'',lon:''}]),
  [{id:'A',name:'서울대학교병원',code:'Q10101',lat:37.58,lon:127}]);
});

test('servicesFor: nearest 종합병원, 의원 within 1 km, 학원 within 500 m and 1 km',()=>{
 const at=(m,extra={})=>({lat:37.5+m/111000,lon:127,...extra});
 const r=servicesFor({lat:37.5,lon:127},[at(3000,{name:'먼병원'}),at(1500,{name:'가까운병원'})],[at(200),at(900),at(1100)],[at(100),at(600),at(1200)]);
 assert.deepEqual({...r,general_hospital_m:Math.round(r.general_hospital_m/10)*10},
  {general_hospital_m:1500,general_hospital_name:'가까운병원',clinic_count_1km:2,academy_count_500m:1,academy_count_1km:2});
 assert.equal(servicesFor({lat:37.5,lon:127},[at(12000,{name:'x'})],[],[]).general_hospital_m,null);
});
