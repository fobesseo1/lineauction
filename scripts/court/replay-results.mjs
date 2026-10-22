// Re-apply saved 매각결과 pages (data/court/standalone/past-result-proofs) to data/court/current.json.
//   node scripts/court/replay-results.mjs
// past-results.mjs writes resultEvidence straight into the state and the court site shows results
// for only 7 days, so a state rebuilt from run inputs (rebuild-state.mjs) loses older results unless
// they are replayed from these pages. Same matching rule as past-results.mjs.
import {readdir,readFile,stat,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {replaceFile} from './store.mjs';
import {parseResults} from './results.mjs';

export async function replayResults(state,dir='data/court/standalone/past-result-proofs'){
 const files=[];for(const name of await readdir(dir).catch(()=>[]))if(name.endsWith('.json'))files.push({name,at:(await stat(`${dir}/${name}`)).mtimeMs});
 files.sort((a,b)=>a.at-b.at);
 let applied=0,pages=0;
 for(const {name} of files){
  let payload;try{payload=JSON.parse(await readFile(`${dir}/${name}`,'utf8'));}catch{continue;}
  let proofs;try{proofs=parseResults(payload);}catch{continue;}
  pages++;
  const stamp=payload.observedAt;
  for(const proof of proofs){
   const item=state.items[`${payload.court}:${proof.caseNumber}:${proof.itemNumber}`];
   if(!item||(item.auctionDate&&item.auctionDate>proof.auctionDate)||item.resultEvidence?.observedAt>stamp)continue;
   item.resultEvidence=proof;applied++;
  }
 }
 return {pages,applied};
}

if(import.meta.url===`file:///${(process.argv[1]??'').replace(/\\/g,'/')}`){
 const state=JSON.parse(await readFile('data/court/current.json','utf8'));
 const result=await replayResults(state);
 const temp=`data/court/current.json.${randomUUID()}.tmp`;
 await writeFile(temp,JSON.stringify(state,null,2),{flush:true});await replaceFile(temp,'data/court/current.json');
 console.log(JSON.stringify(result));
}
