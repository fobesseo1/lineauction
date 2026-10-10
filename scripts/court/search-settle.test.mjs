import test from 'node:test';
import assert from 'node:assert/strict';
import {settleSearchTables as settle} from './search-settle.mjs';
const setup=overrides=>({read:async()=>'',wait:async()=>{},guard:async()=>{},stopped:async()=>false,...overrides});
test('changing property tables cannot be accepted as settled',async()=>{const frames=['basic','basic + item1','basic + item1 + item2'];let reads=0;await settle(setup({read:async()=>frames[Math.min(reads++,2)]}));assert.equal(reads,5);});
test('continuously changing results fail without issuing requests',async()=>{let reads=0;await assert.rejects(settle(setup({read:async()=>String(reads++),maxPolls:4})),/did not settle/);assert.equal(reads,4);});
test('STOP and guard prevent accepting a result',async()=>{await assert.rejects(settle(setup({stopped:async()=>true})),/STOP/);await assert.rejects(settle(setup({guard:async()=>{throw Error('denied');}})),/denied/);});
