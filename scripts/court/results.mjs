import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {date,courtRowMatches} from './core.mjs';

// The official results table has one 7-cell identity row and one 3-cell result row.
export function parseResults(payload){
 if(payload.kind!=='court-results'||new URL(payload.sourceUrl).origin!=='https://www.courtauction.go.kr'||!Number.isFinite(Date.parse(payload.observedAt)))throw Error('Invalid result provenance');
 if(!payload.query.includes(payload.court)||!Array.isArray(payload.rows))throw Error('Wrong result court');
 const results=[];
 for(let i=0;i<payload.rows.length;i++){
  const row=payload.rows[i];if(row.length!==7)throw Error('Unsupported result identity row');
  if(!row[1].trim()&&!row[2].trim()){const continuation=payload.rows[++i];if(continuation?.length!==3||continuation.some(v=>v.trim()))throw Error('Invalid bundled result continuation');continue;}
  const caseNumber=row[1].match(/\d{4}타경\d+/)?.[0],itemNumber=Number(row[2]);
  if(!caseNumber||!courtRowMatches(row[1],payload.court)||!Number.isInteger(itemNumber)||itemNumber<1)throw Error('Invalid result identity');
  const outcome=payload.rows[++i];if(outcome?.length!==3)throw Error('Missing result row');
  const result=outcome[2].trim().split(/\s+/)[0];if(!['매각','유찰'].includes(result))throw Error('Unknown sale result');
  const auctionDate=date(row[6]);if(!auctionDate)throw Error('Missing result date');
  results.push({court:payload.court,caseNumber,itemNumber,result,auctionDate,observedAt:payload.observedAt,sourceUrl:payload.sourceUrl,identityRow:row,resultRow:outcome,raw:[...row,...outcome].join('\n')});
 }return results;
}
export async function saveResults(payload){
 const proofs=parseResults(payload),state=JSON.parse(await readFile('data/court/current.json','utf8'));let matched=0,closed=0;
 for(const proof of proofs){const item=state.items[`${proof.court}:${proof.caseNumber}:${proof.itemNumber}`];if(!item)continue;
  if(item.resultEvidence?.observedAt>proof.observedAt)continue;
  // An old successful bid must never hide an item with a newer scheduled sale.
  if(item.auctionDate&&item.auctionDate>proof.auctionDate)continue;
  item.resultEvidence=proof;matched++;if(proof.result==='매각')closed++;
 }
 await mkdir('data/court/results',{recursive:true});await writeFile(`data/court/results/${randomUUID()}.json`,JSON.stringify(payload,null,2));
 await writeFile('data/court/results-state.tmp',JSON.stringify(state,null,2));await rename('data/court/results-state.tmp','data/court/current.json');
 return{kind:'court-results',court:payload.court,observed:proofs.length,matched,closed};
}
