import test from 'node:test';
import assert from 'node:assert/strict';
import {roadAddress,lotAddress} from './fill-pnu.mjs';

test('roadAddress keeps the road and building number only',()=>{
 assert.equal(roadAddress('인천광역시 남동구 남동대로777번길 25 16층1605호 (구월동,카르페디엠)'),'인천광역시 남동구 남동대로777번길 25');
 assert.equal(roadAddress('경기도 파주시 파주읍 통일로1546번길 43-8 402동 3층304호 (더힐팰리스)'),'경기도 파주시 파주읍 통일로1546번길 43-8');
 assert.equal(roadAddress('경기도 평택시 송탄로361번길 41 6층602호'),'경기도 평택시 송탄로361번길 41');
 assert.equal(roadAddress('인천광역시 중구 월미로226번길 10 4층 403호 (북성동1가,오션테라스)'),'인천광역시 중구 월미로226번길 10');
});

test('lotAddress keeps the 지번 and drops 외 N필지, building and unit',()=>{
 assert.equal(lotAddress('경기도 부천시 원미구 심곡동 385 외 3필지 심곡동피노키오상가 제10층 제1003호'),'경기도 부천시 원미구 심곡동 385');
 assert.equal(lotAddress('서울특별시 동작구 신대방동 688-20 금화하이빌 제3층 301호'),'서울특별시 동작구 신대방동 688-20');
 assert.equal(lotAddress('경기도 화성시 만세구 장안면 어은리 714-1 외 1필지 제2동 제4층 제401호'),'경기도 화성시 만세구 장안면 어은리 714-1');
 assert.equal(lotAddress('경기도 이천시 중리동 313-9 임야'),'경기도 이천시 중리동 313-9');
});

test('lotAddress handles 외 and 번지 glued to the number',()=>{
 assert.equal(lotAddress('경기도 하남시 풍산동 243-32외 6필지 A3동 206호'),'경기도 하남시 풍산동 243-32');
 assert.equal(lotAddress('경기도 시흥시 은행동607번지 럭스나인은계 109호'),'경기도 시흥시 은행동 607');
 assert.equal(lotAddress('경기도 하남시 풍산동 598번지 희가로프리미어'),'경기도 하남시 풍산동 598');
});

test('shortAddress and blockBuilding',async()=>{
 const {shortAddress,blockBuilding}=await import('./fill-pnu.mjs');
 assert.equal(shortAddress('경기도 화성시 오산동 982-1'),'오산동 982-1');
 assert.equal(blockBuilding('경기도 평택시 합정동 소사3지구4블록 평택뉴비전엘크루 110동 3층302호'),'평택뉴비전엘크루');
 assert.equal(blockBuilding('경기도 고양시 일산동구 식사동 식사2도시개발구역5블록1로트 베네하임2차 1층101호'),'베네하임2차');
 assert.equal(blockBuilding('경기도 여주시 세종대왕면 신지리 능서역세권지구 A26블록 5로트 대지'),null);
});

test('lotAddress finds an address in brackets',()=>{
 assert.equal(lotAddress('고덕강일지구 근린생활시설용지7-2(서울특별시 강동구 강일동 산22-1 일원)'),'서울특별시 강동구 강일동 산22-1');
});
