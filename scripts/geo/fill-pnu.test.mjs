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
