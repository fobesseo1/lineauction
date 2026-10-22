// Rebuild data/court/current.json from the saved run inputs (data/court/runs/<id>/raw.json), in
// order, through the same reconcile() the collectors use. For when current.json is lost or
// corrupted (2026-10-21: overwritten with zero bytes mid-write).
//   node scripts/court/rebuild-state.mjs [--write]
// Without --write the result goes to data/court/current.rebuilt.json for checking.
// Result evidence (past-results) is replayed from the saved result pages; case-repair evidence is not.
import {readdir,readFile,writeFile,rename,copyFile} from 'node:fs/promises';
import {reconcile} from './core.mjs';
import {replayResults} from './replay-results.mjs';

const dirs=(await readdir('data/court/runs',{withFileTypes:true})).filter(d=>d.isDirectory()).map(d=>d.name).sort();
let state,applied=0,rejected=0,skipped=0,failed=0;
for(const [i,name] of dirs.entries()){
 let run;
 try{run=JSON.parse(await readFile(`data/court/runs/${name}/raw.json`,'utf8'));}catch{skipped++;continue;}
 try{const report=JSON.parse(await readFile(`data/court/runs/${name}/report.json`,'utf8'));if(report.status==='rejected'){rejected++;continue;}}catch{}
 // In place: copying the whole growing state for each of ~16k runs took hours. A run that fails
 // validation partway may leave partial changes, as the collectors' rejected runs never got here.
 try{state=reconcile(state,run,{inPlace:true}).state;applied++;}catch{failed++;}
 if(i%1000===0)console.log(`${i}/${dirs.length} applied ${applied}`);
}
// Results were written into the state directly, not as runs: replay the saved result pages too.
const results=state?await replayResults(state):null;
const items=Object.keys(state?.items??{}).length;
console.log(JSON.stringify({runs:dirs.length,applied,rejected,skipped,failed,items,results}));
await writeFile('data/court/current.rebuilt.json',JSON.stringify(state,null,2));
if(process.argv.includes('--write')){
 await copyFile('data/court/current.json',`data/court/current.corrupt-${Date.now()}.json`).catch(()=>{});
 await rename('data/court/current.rebuilt.json','data/court/current.json');
 console.log('current.json replaced');
}
