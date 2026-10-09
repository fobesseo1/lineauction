import {courtRowMatches} from './core.mjs';
export function selectTargetResults(rows,court,targets){
 const selected=[],unsupported=[];
 for(let n=0;n<rows.length;n+=2){const identity=rows[n],outcome=rows[n+1];
  if(identity?.length!==7||outcome?.length!==3)throw Error('Unexpected official result row structure');
  if(!identity[1].trim()&&!identity[2].trim())continue;
  const caseNumber=identity[1].match(/\d{4}타경\d+/)?.[0],itemNumber=Number(identity[2]);
  if(!caseNumber||!courtRowMatches(identity[1],court)||!Number.isInteger(itemNumber)||itemNumber<1)throw Error('Result court or identity mismatch');
  const key=`${court}:${caseNumber}:${itemNumber}`;if(!targets.has(key))continue;
  const result=outcome[2].trim().split(/\s+/)[0];
  if(!['매각','유찰'].includes(result)){unsupported.push({key,result});continue;}
  selected.push(identity,outcome);
 }return {rows:selected,unsupported};
}
