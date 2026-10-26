import test from 'node:test';
import assert from 'node:assert/strict';
import {hopMinutes,buildGraph,fromDestination,commuteFor,stationMinutes} from './commute-core.mjs';

const st=(id,lat,lon,lines)=>({id,name:id,latitude:lat,longitude:lon,lines,points:[{lat,lon}]});
// A─B on 2호선 (~1 km), B─C on 9호선 (~1 km); B is a 환승역.
const stations=[st('A',37.500,127.000,['2호선']),st('B',37.509,127.000,['2호선','9호선']),st('C',37.518,127.000,['9호선'])];
const routes=[{line:'2호선',stations:['A','B']},{line:'9호선',stations:['C','B']}];

test('hopMinutes: stop + 54 km/h, express lines at their own speed',()=>{
 assert.ok(Math.abs(hopMinutes('2호선',1000)-(0.5+1/0.9))<1e-9);
 assert.equal(hopMinutes('GTX-A',1000),2);
 assert.equal(hopMinutes('GTX-A',16000),10);
});

test('shortest ride counts transfers and works from either end',()=>{
 const ride=fromDestination(buildGraph(stations,routes),stations,new Set(['C']));
 assert.equal(ride.get('C').t,0);
 assert.equal(ride.get('A').x,1);
 assert.ok(Math.abs(ride.get('A').t-(5+2*hopMinutes('2호선',1000.7)))<0.05);
});

test('commuteFor adds walk, wait and last walk; empty beyond 2 km',()=>{
 const ride=new Map([['A',{t:10,x:1}],['C',{t:0,x:0}]]);
 assert.deepEqual(commuteFor([{id:'A',m:500}],ride,()=>7),{minutes:7+3+10+5,transfers:1,from:'A'});
 assert.equal(commuteFor([{id:'C',m:100}],ride,()=>2).minutes,7);
 assert.equal(commuteFor([{id:'A',m:2100}],ride,()=>40),null);
});

test('stationMinutes is commuteFor without the two walks',()=>{
 assert.equal(stationMinutes(0),0);
 assert.equal(stationMinutes(10.4),13);
 assert.equal(commuteFor([{id:'A',m:500}],new Map([['A',{t:10.4,x:0}]]),()=>7).minutes,7+stationMinutes(10.4)+5);
});
