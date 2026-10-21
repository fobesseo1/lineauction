import test from 'node:test';
import assert from 'node:assert/strict';
import {photoLinks,MAX_PHOTOS} from './photos.mjs';

const link=(n,file=1)=>({urlAdr:`https://www.onbid.co.kr/op/cm/syc/filemng/filemngprcs/FileMngPrcsController/dnldFile.do?atchFileLstNo=${file}&atchSn=${n}&hashCrpsNo=X&downloadImageKind=THNL_NM`});

test('photoLinks asks for originals in attachment order, deduplicated and capped',()=>{
 const links=photoLinks([{potoUrlList:[link(3),link(1),link(2)]},{potoUrlList:[link(1)]}]);
 assert.deepEqual(links.map(l=>l.sn),[1,2,3]);
 assert.ok(links.every(l=>!l.url.includes('downloadImageKind')));
 assert.equal(photoLinks([{potoUrlList:Array.from({length:9},(_,i)=>link(i+1))}]).length,MAX_PHOTOS);
});

test('photoLinks ignores links outside Onbid',()=>{
 assert.deepEqual(photoLinks([{potoUrlList:[{urlAdr:'https://evil.example/dnldFile.do?atchSn=1'},{urlAdr:'not a url'}]}]),[]);
 assert.deepEqual(photoLinks([{potoUrlList:null}]),[]);
});
