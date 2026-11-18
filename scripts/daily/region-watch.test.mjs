import test from 'node:test';
import assert from 'node:assert/strict';
import {watchMessage} from './region-watch.mjs';

test('watch message shows from → to, counts and the whole-country row',()=>{
 const m=watchMessage([{sido:'서울특별시',what:'단지 수 줄어듦',from:3412,to:3407},{sido:'경기도',what:'기존 단지 내용 바뀜',to:100,of:5665},{sido:'*',what:'역',from:700,to:647},{sido:'테스트도',what:'시도 자료가 통째로 사라짐'}]);
 assert.match(m,/서울특별시: 단지 수 줄어듦 3,412 → 3,407/);
 assert.match(m,/경기도: 기존 단지 내용 바뀜 100 \/ 5,665/);
 assert.match(m,/전체: 역 700 → 647/);
 assert.match(m,/테스트도: 시도 자료가 통째로 사라짐$/m);
});
