import test from 'node:test';
import assert from 'node:assert/strict';
import {commercialKind,normalizeZone,jimokGroup,floorClass,landPrice,housePrice,unitPrice,buildingPrice} from './commercial.mjs';

test('commercialKind splits land, houses, shop units and whole buildings',()=>{
 assert.equal(commercialKind('전답'),'land');assert.equal(commercialKind('임야'),'land');
 assert.equal(commercialKind('단독주택다가구'),'house');
 assert.equal(commercialKind('근린시설','서울 종로구 종로 183 지2층 2009호'),'unit');
 assert.equal(commercialKind('근린시설','경기 하남시 덕풍동 1-2'),'building');
 assert.equal(commercialKind('상업용빌딩','… 101호'),'building');
 assert.equal(commercialKind('공장시설'),null);
});

test('zone, land category and floor helpers',()=>{
 assert.equal(normalizeZone('제2종일반주거지역'),normalizeZone('제2종일반주거'));
 assert.equal(jimokGroup('답'),jimokGroup('전'));assert.notEqual(jimokGroup('대'),jimokGroup('전'));
 assert.equal(floorClass('지2층 2009호'),'B');assert.equal(floorClass('제1층 제101호'),'1');assert.equal(floorClass('5층501호'),'U');
});

const land=(amount,land_area,extra={})=>({amount,land_area,zone:'제2종일반주거',use_type:'대',deal_date:'2026-01-01',dealing:'중개거래',...extra});

test('landPrice prefers the dong, then the 시군구, by price per ㎡',()=>{
 const dong=[1,2,3,4,5].map(()=>land(10000,100));
 const r=landPrice({area:200,zone:'제2종일반주거지역',jimok:'대',dong});
 assert.equal(r.basis,'land-dong');assert.equal(r.priceManwon,20000);assert.equal(r.confidence,'low');
 const lawd=[...Array(8)].map(()=>land(5000,100));
 assert.equal(landPrice({area:100,zone:'제2종일반주거지역',jimok:'대',dong:dong.slice(0,2),lawd}).basis,'land-sigungu');
 assert.equal(landPrice({area:100,zone:'일반상업지역',jimok:'대',dong}),null);
 assert.equal(landPrice({area:100,zone:null,jimok:'대',dong:[...dong.slice(0,4),land(1,100,{share:'지분'})]}),null);
});

test('housePrice and buildingPrice compare land ㎡ prices; unitPrice uses the same building first',()=>{
 const h=[1,2,3,4,5].map(()=>({amount:60000,land_area:120,build_year:2000,deal_date:'2026-01-01',dealing:'중개거래'}));
 assert.equal(housePrice({landArea:100,buildYear:1998,dong:h}).priceManwon,50000);
 const b=[1,2,3,4,5].map(()=>({amount:300000,land_area:300,zone:'준주거',building_type:'일반',deal_date:'2026-01-01',dealing:'중개거래'}));
 assert.equal(buildingPrice({plotArea:250,zone:'준주거지역',dong:b}).priceManwon,250000);
 const unit=[{amount:30000,area:30,building_type:'집합',floor:1,deal_date:'2026-01-01',dealing:'중개거래'},{amount:20000,area:30,building_type:'집합',floor:5,deal_date:'2026-01-01',dealing:'중개거래'}];
 const u=unitPrice({area:40,floor:'1',use:'근린시설',building:unit});
 assert.equal(u.basis,'unit-building');assert.equal(u.priceManwon,40000);assert.equal(u.count,1);
});
