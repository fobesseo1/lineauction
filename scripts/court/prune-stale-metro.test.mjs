import test from 'node:test';
import assert from 'node:assert/strict';
import {staleMetroKeys} from './prune-stale-metro.mjs';

const METRO=['부산광역시','대구광역시','대전광역시','세종특별자치시','광주광역시','울산광역시'];
const item=(addresses,lastSeenAt,court='부산지방법원')=>({court,lastSeenAt,assets:addresses.map(address=>({address}))});
const state={items:{
 old_busan:item(['부산광역시 해운대구 우동 1'],'2026-10-07T03:00:00Z'),
 new_busan:item(['부산광역시 해운대구 우동 2'],'2026-11-18T03:00:00Z'),
 old_sejong:item(['세종특별자치시 나성동 3'],'2026-10-07T03:00:00Z','대전지방법원'),
 old_seoul:item(['서울특별시 강남구 대치동 1'],'2026-10-07T03:00:00Z','서울중앙지방법원'),
 old_gyeongbuk:item(['경상북도 의성군 의성읍 1'],'2026-10-07T03:00:00Z','의성지원'),
 mixed:item(['부산광역시 중구 1','경상남도 양산시 1'],'2026-10-07T03:00:00Z'),
 no_address:item([],'2026-10-07T03:00:00Z'),
 no_seen:item(['대구광역시 수성구 1'],undefined,'대구지방법원'),
}};

test('removes only old items fully inside the newly enabled 광역시·세종',()=>{
 assert.deepEqual(staleMetroKeys(state,METRO,'2026-11-01T00:00:00Z').sort(),['old_busan','old_sejong']);
});
test('never touches capital, other provinces, mixed or address-less items',()=>{
 const keys=new Set(staleMetroKeys(state,METRO,'2030-01-01T00:00:00Z'));
 for(const k of ['old_seoul','old_gyeongbuk','mixed','no_address','no_seen'])assert.ok(!keys.has(k),k);
 assert.ok(keys.has('new_busan'),'a later cutoff includes newer items');
});
test('with no metro enabled nothing matches',()=>{
 assert.throws(()=>staleMetroKeys(state,[],'2026-11-01T00:00:00Z'));
});
