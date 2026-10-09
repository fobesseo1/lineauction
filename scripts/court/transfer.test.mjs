import test from 'node:test';
import assert from 'node:assert/strict';
import {createTransferAssembler} from './transfer.mjs';
test('사진 JSON을 작은 조각으로 옮겨 완성 전에는 저장용 payload를 반환하지 않는다',()=>{
 const accept=createTransferAssembler();const id='public-photo-1';
 assert.deepEqual(accept({id,index:0,total:2,data:'{"kind":"court-'}),{received:1,total:2});
 assert.equal(accept({id,index:0,total:2,data:'{"kind":"court-'}).received,1);
 assert.deepEqual(accept({id,index:1,total:2,data:'media"}'}).payload,{kind:'court-media'});
});
test('순서 뒤바뀜·변조된 재전송·과대 데이터·만료된 부분 전송을 거절한다',()=>{
 let time=0;const accept=createTransferAssembler({now:()=>time,maxBytes:12,ttl:10});const id='public-photo-2';
 assert.throws(()=>accept({id,index:1,total:2,data:'x'}));
 accept({id,index:0,total:2,data:'1234'});
 assert.throws(()=>accept({id,index:0,total:2,data:'5678'}));
 time=11;assert.throws(()=>accept({id,index:1,total:2,data:'x'}));
 assert.throws(()=>accept({id,index:0,total:1,data:'1234567890123'}));
});
