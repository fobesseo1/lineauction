import test from 'node:test';
import assert from 'node:assert/strict';
import {readAllOfficialPhotos} from './all-photos.mjs';
test('retain at most five distinct displayed photos after loading, without extra navigation',async()=>{
 const photos=Array.from({length:12},(_,i)=>({alt:`전경도_${i+1}`,dataUrl:`data:image/jpeg;base64,${i}`}));const waits=[];
 const page={async waitForFunction(fn,arg,options){waits.push(options.timeout);},locator(selector){assert.equal(selector,'img:visible');return {async evaluateAll(){return [photos[0],photos[0],...photos.slice(1)];}};}};
 assert.deepEqual(await readAllOfficialPhotos(page),photos.slice(0,5));assert.deepEqual(waits,[1000,20000]);
});
test('missing photo elements are observed before recording absence',async()=>{const page={async waitForFunction(){throw Object.assign(Error('none'),{name:'TimeoutError'});}};assert.deepEqual(await readAllOfficialPhotos(page),[]);});
test('loading failures propagate and cannot become official absence',async()=>{let calls=0;const page={async waitForFunction(){if(++calls===2)throw Object.assign(Error('broken image'),{name:'TimeoutError'});}};await assert.rejects(readAllOfficialPhotos(page),/broken image/);});
