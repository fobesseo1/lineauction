import test from 'node:test';
import assert from 'node:assert/strict';
import {latest} from './r-one.mjs';

const row=(region,q,v,item='소득수익률')=>({CLS_FULLNM:region,WRTTIME_IDTFR_ID:q,DTA_VAL:v,ITM_NM:item});

test('latest keeps the capital area and the newest quarter',()=>{
 const r=latest([row('서울','202601',1),row('서울','202602',2),row('부산','202602',9)],'소득수익률');
 assert.deepEqual(r,{quarter:'202602',values:{'서울':2}});
});

test('yields add up the last four quarters, or nothing when fewer exist',()=>{
 const four=['202503','202504','202601','202602'].map((q,i)=>row('경기',q,0.5+i*0.1));
 assert.deepEqual(latest([row('경기','202502',9),...four],'소득수익률',{sum4:true}).values,{'경기':2.6});
 assert.deepEqual(latest(four.slice(1),'소득수익률',{sum4:true}).values,{});
});
