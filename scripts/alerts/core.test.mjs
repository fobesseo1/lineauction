import test from 'node:test';
import assert from 'node:assert/strict';
import {usableDiscount,isOpen,matchesRule,ruleKey,snapshot,watchChanges,won,message,MAX_ITEMS} from './core.mjs';

const p={id:'p1',source:'court',section:'apartment',sido:'서울특별시',sigungu:'마포구',usage_type:'아파트',minimum_bid_price:500000000,failed_bid_count:2,sale_date:'2026-10-20'};
const a={market_price_method:'median-6m',confidence:'high',discount_rate:25};

test('usableDiscount skips reference prices, missing sales and low confidence',()=>{
 assert.equal(usableDiscount(a),25);
 assert.equal(usableDiscount({...a,confidence:'low'}),null);
 assert.equal(usableDiscount({...a,market_price_method:'no-recent-sales'}),null);
 assert.equal(usableDiscount({...a,market_price_method:'land-dong-36m'}),null);
 assert.equal(usableDiscount({...a,market_price_method:'appraisal-mismatch'}),null);
 assert.equal(usableDiscount({...a,market_price_method:'villa-building-12m',confidence:'medium'}),25);
});

test('matchesRule treats empty lists and nulls as no condition',()=>{
 assert.equal(matchesRule({id:'r',sources:[],sido:[],sigungu:null},p,a),true);
 assert.equal(matchesRule({id:'r',sigungu:['강남구']},p,a),false);
 assert.equal(matchesRule({id:'r',section:'commercial'},p,a),false);
 assert.equal(matchesRule({id:'r',max_minimum_bid:400000000},p,a),false);
 assert.equal(matchesRule({id:'r',min_failed_bids:3},p,a),false);
 assert.equal(matchesRule({id:'r',min_discount_rate:20},p,a),true);
 assert.equal(matchesRule({id:'r',min_discount_rate:30},p,a),false);
 assert.equal(matchesRule({id:'r',min_discount_rate:10},p,{...a,confidence:'low'}),false);
});

test('a rule fires again when the minimum price drops',()=>{
 assert.notEqual(ruleKey({id:'r'},p),ruleKey({id:'r'},{...p,minimum_bid_price:400000000}));
});

test('isOpen drops past sale dates',()=>{
 assert.equal(isOpen(p,'2026-10-13'),true);
 assert.equal(isOpen(p,'2026-10-21'),false);
 assert.equal(isOpen({bid_end_at:'2026-10-14T05:00:00Z'},'2026-10-13'),true);
});

test('watchChanges reports price, 유찰 and result changes but not first sight',()=>{
 const before=snapshot(p);
 assert.deepEqual(watchChanges(null,before),[]);
 assert.deepEqual(watchChanges(before,snapshot({...p,minimum_bid_price:400000000,failed_bid_count:3})),['최저가 5억 → 4억','유찰 3회']);
 assert.deepEqual(watchChanges(before,snapshot({...p,last_result:'매각'})),['결과: 매각']);
});

test('won and message formatting',()=>{
 assert.equal(won(523000000),'5.2억');assert.equal(won(1500000000),'15억');assert.equal(won(35000000),'3,500만');
 const text=message('제목',Array.from({length:MAX_ITEMS+3},(_,i)=>`• ${i}`),'https://x');
 assert.match(text,/외 3건/);
});
