import test from 'node:test';
import assert from 'node:assert/strict';
import {publicSidoNames,publicOf,isPublicSido} from './public-regions.mjs';

const fakeDb=(result)=>({schema:(s)=>{assert.equal(s,'app');return {rpc:async(fn,args)=>{assert.equal(fn,'service_sido');assert.deepEqual(args,{p_admin:false});return result;}};}});

test('publicSidoNames reads app.service_sido() for customers (not admin)',async()=>{
 assert.deepEqual(await publicSidoNames(fakeDb({data:['서울특별시','인천광역시','경기도'],error:null})),['서울특별시','인천광역시','경기도']);
});

test('publicSidoNames throws instead of guessing when the table is unreadable',async()=>{
 await assert.rejects(publicSidoNames(fakeDb({data:null,error:{message:'permission denied'}})),/PUBLIC_REGIONS_UNAVAILABLE/);
 await assert.rejects(publicSidoNames(fakeDb({data:'서울특별시',error:null})),/PUBLIC_REGIONS_BAD_RESPONSE/);
 await assert.rejects(publicSidoNames(fakeDb({data:[1,2],error:null})),/PUBLIC_REGIONS_BAD_RESPONSE/);
});

test('an empty public list is returned as empty (callers decide; nothing is public)',async()=>{
 assert.deepEqual(await publicSidoNames(fakeDb({data:[],error:null})),[]);
});

test('publicOf keeps collected regions that are public, in collected order',()=>{
 const collected=['서울특별시','경기도','인천광역시','부산광역시'];
 // 부산 collected but closed on the site: left out.
 assert.deepEqual(publicOf(collected,['서울특별시','인천광역시','경기도']),['서울특별시','경기도','인천광역시']);
 // 부산 opened: included.
 assert.deepEqual(publicOf(collected,['서울특별시','부산광역시','인천광역시','경기도']),collected);
 // Public on the site but not collected (should not happen): not sent either.
 assert.deepEqual(publicOf(['서울특별시'],['서울특별시','대구광역시']),['서울특별시']);
 // Everything closed.
 assert.deepEqual(publicOf(collected,[]),[]);
});

test('isPublicSido matches the full 시도 name exactly',()=>{
 const pub=isPublicSido(['서울특별시','경기도']);
 assert.equal(pub('서울특별시'),true);
 assert.equal(pub('부산광역시'),false);
 assert.equal(pub('서울'),false);
 assert.equal(pub(null),false);
 assert.equal(pub(undefined),false);
});
