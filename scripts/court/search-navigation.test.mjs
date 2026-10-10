import test from 'node:test';
import assert from 'node:assert/strict';
import {enterCaseSearch as enter} from './search-navigation.mjs';
const setup=overrides=>({guard:async()=>{},stopped:async()=>false,canReuse:async()=>true,openHome:async()=>{},closeNotices:async()=>{},clickSearch:async()=>{},record:async()=>{},...overrides});
test('usable official navigation does not reload the home page',async()=>{let homes=0,clicks=0;await enter(setup({openHome:async()=>homes++,clickSearch:async()=>clicks++}));assert.equal(homes,0);assert.equal(clicks,1);});
test('initial or unusable UI opens home only once',async()=>{let homes=0,clicks=0;await enter(setup({canReuse:async()=>false,openHome:async()=>homes++,clickSearch:async()=>clicks++}));assert.equal(homes,1);assert.equal(clicks,1);});
test('access challenge and STOP prevent navigation',async()=>{for(const overrides of [{guard:async()=>{throw Error('denied');}},{stopped:async()=>true}]){let clicks=0;await assert.rejects(enter(setup({...overrides,clickSearch:async()=>clicks++})));assert.equal(clicks,0);}});
test('failed search click propagates without retry',async()=>{let calls=0;await assert.rejects(enter(setup({clickSearch:async()=>{calls++;throw Error('not enabled');}})));assert.equal(calls,1);});
