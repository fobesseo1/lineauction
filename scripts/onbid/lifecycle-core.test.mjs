import test from 'node:test';
import assert from 'node:assert/strict';
import {trackMissing} from './lifecycle-core.mjs';

test('first missing day is recheck, a second distinct day closes, reappearance restores',()=>{
 const day1=trackMissing({},['a','b','c'],['a','b'],'2026-10-11');
 assert.deepEqual([day1.recheck,day1.closed,day1.restored],[['c'],[],[]]);
 const sameDay=trackMissing(day1.missing,['a','b','c'],['a','b'],'2026-10-11');
 assert.deepEqual([sameDay.recheck,sameDay.closed],[['c'],[]]);
 const day2=trackMissing(day1.missing,['a','b','c'],['a','b'],'2026-10-12');
 assert.deepEqual([day2.recheck,day2.closed],[[],['c']]);
 const back=trackMissing(day2.missing,['a','b','c'],['a','b','c'],'2026-10-13');
 assert.deepEqual([back.recheck,back.closed,back.restored,back.missing],[[],[],['c'],{}]);
});
