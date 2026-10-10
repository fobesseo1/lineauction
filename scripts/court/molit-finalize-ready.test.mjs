import test from 'node:test';import assert from 'node:assert/strict';import {molitFinalizeReady} from './molit-finalize-ready.mjs';
test('MOLIT apply requires complete pass, final photo DB success, staged completion and both photo locks free',()=>{
 const x={audit:{collectionComplete:true,counts:{verified:6383}},photos:{status:'completed',errors:[]},staged:{status:'staged'},collectorActive:false,pipelineActive:false};
 assert.equal(molitFinalizeReady(x),true);
 for(const patch of [{collectorActive:true},{pipelineActive:true},{audit:{collectionComplete:false,counts:{verified:6383}}},{audit:{collectionComplete:true,counts:{verified:6382}}},{photos:{status:'failed',errors:[]}},{photos:{status:'completed',errors:['failure']}},{staged:{status:'running'}},{staged:{status:'partial'}}])assert.equal(molitFinalizeReady({...x,...patch}),false);
});
