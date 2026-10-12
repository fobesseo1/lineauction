import test from 'node:test';
import assert from 'node:assert/strict';
import {jibunPnu,median,areaStats,periodStart,placeId,monthlyHistory} from './summary.mjs';

test('jibunPnu handles plain, sub-lot and mountain lots',()=>{
 assert.equal(jibunPnu('1168010600','316'),'1168010600103160000');
 assert.equal(jibunPnu('1168010800','236-8'),'1168010800102360008');
 assert.equal(jibunPnu('1132010600','산69-1'),'1132010600200690001');
 assert.equal(jibunPnu(null,'316'),null);
 assert.equal(jibunPnu('1168010600','316외'),null);
});

test('median of odd and even lists',()=>{
 assert.equal(median([3,1,2]),2);assert.equal(median([1,2,3,10]),3);assert.equal(median([]),null);
});

test('areaStats excludes cancelled and 직거래 sales and computes the jeonse ratio',()=>{
 const t=[
  {deal:'sale',amount:100000,deal_date:'2026-03-01',floor:5,dealing:'중개거래'},
  {deal:'sale',amount:110000,deal_date:'2026-06-01',floor:9,dealing:'중개거래'},
  {deal:'sale',amount:50000,deal_date:'2026-07-01',floor:2,dealing:'직거래'},
  {deal:'sale',amount:120000,deal_date:'2026-08-01',floor:3,dealing:'중개거래',cancel_date:'2026-09-01'},
  {deal:'rent',deposit:60000,monthly_rent:0},{deal:'rent',deposit:50000,monthly_rent:0},{deal:'rent',deposit:10000,monthly_rent:150},
 ];
 const s=areaStats(t);
 assert.equal(s.sale_count,2);assert.equal(s.sale_median,105000);assert.equal(s.sale_last_amount,110000);assert.equal(s.sale_last_floor,9);
 assert.equal(s.jeonse_count,2);assert.equal(s.jeonse_median,55000);assert.equal(s.wolse_count,1);assert.equal(s.jeonse_ratio,52.4);
});

test('periodStart is one year back in KST and placeId is stable',()=>{
 assert.equal(periodStart(new Date('2026-10-12T01:00:00Z')),'2025-10-12');
 assert.equal(placeId('apt','11680','대치동','316'),'apt:11680:대치동:316');
});

test('monthlyHistory lines up medians with the month list',()=>{
 const h=monthlyHistory([
  {deal:'sale',amount:100,deal_date:'2026-01-05',dealing:'중개거래'},{deal:'sale',amount:120,deal_date:'2026-01-20',dealing:'중개거래'},
  {deal:'sale',amount:999,deal_date:'2026-01-21',dealing:'직거래'},{deal:'rent',deposit:50,monthly_rent:0,deal_date:'2026-03-01'},
  {deal:'sale',amount:80,deal_date:'2025-01-01',dealing:'중개거래'},
 ],['2026-01','2026-02','2026-03']);
 assert.deepEqual(h,{from:'2026-01',sale:'0:110:2',jeonse:'2:50:1'});
});
