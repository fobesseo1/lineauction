import {readFile} from 'node:fs/promises';
import {caseTargets} from './case-repair-core.mjs';

// A new checkpoint preserves yesterday's audit; every requested key must already be in scope.
export async function recheckOptions(argv,state,audit,courts,base) {
 const file=argv.find(x=>x.startsWith('--recheck-file='))?.slice(15);
 const tag=argv.find(x=>x.startsWith('--checkpoint-tag='))?.slice(17);
 if(!file&&!tag)return {targets:caseTargets(state,audit,courts),prefix:base,scoped:false};
 if(!file||!tag||!/^[a-z0-9-]{1,64}$/.test(tag))throw Error('Recheck requires a file and safe checkpoint tag');
 const keys=JSON.parse(await readFile(file,'utf8'));
 if(!Array.isArray(keys)||!keys.length||keys.some(k=>typeof k!=='string')||new Set(keys).size!==keys.length)throw Error('Invalid recheck keys');
 const targets=caseTargets(state,{missingDetails:keys.map(key=>({key}))},courts);
 if(targets.length!==keys.length)throw Error('Recheck key is missing or outside existing Seoul/Gyeonggi scope');
 return {targets,prefix:`${base}-${tag}`,scoped:true};
}
