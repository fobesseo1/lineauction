import test from 'node:test';
import assert from 'node:assert/strict';
import {readAllOfficialPhotos} from './all-photos.mjs';
test('all photos are retained beyond the former ten-photo cap, duplicates omitted',async()=>{
 const photos=Array.from({length:12},(_,i)=>({alt:`전경도_${i+1}`,dataUrl:`data:image/jpeg;base64,${i}`}));
 let waited=false;
 const page={async waitForFunction(){waited=true;},locator(selector){assert.equal(selector,'img:visible');return {async evaluateAll(){return [...photos,photos[0]];}};}};
 assert.deepEqual(await readAllOfficialPhotos(page),photos);assert.equal(waited,true);
});
