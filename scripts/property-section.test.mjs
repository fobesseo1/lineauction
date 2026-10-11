import test from 'node:test';
import assert from 'node:assert/strict';
import {sectionOf,courtSectionText} from './property-section.mjs';

test('residential complex types go to the apartment section',()=>{
 for(const u of ['아파트','오피스텔','다세대','연립주택,다세대,빌라','빌라','도시형생활주택','다세대주택','주상복합'])assert.equal(sectionOf(u),'apartment',u);
});

test('houses, shops, buildings and land go to the commercial section',()=>{
 for(const u of ['단독주택','단독주택다가구','다가구주택','근린시설','상가','근린생활시설','대지','임야','전답','공장시설','기타주거용건물',null,''])assert.equal(sectionOf(u),'commercial',String(u));
});

test('the mixed court category is decided by an officetel mention',()=>{
 const officetel={detail:{use:'오피스텔'},assets:[{raw:'서울 ... 오피스텔 1004호'}]};
 const shop={detail:null,assets:[{raw:'서울 ... 1층140호 [집합건물 철근콘크리트구조]'}]};
 assert.equal(sectionOf('상가,오피스텔,근린시설',courtSectionText(officetel)),'apartment');
 assert.equal(sectionOf('상가,오피스텔,근린시설',courtSectionText(shop)),'commercial');
});
