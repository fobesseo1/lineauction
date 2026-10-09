import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {inSeoulGyeonggi} from './scope.mjs';
import {mapCourtProperty,comparisonExclusion} from './pipeline-core.mjs';
import {lifecycleFromItem} from './lifecycle.mjs';

const read=async(path,fallback)=>{try{return JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code==='ENOENT')return fallback;throw error;}};
const state=await read('data/court/current.json',{});
const items=Object.values(state.items??{}).filter(i=>inSeoulGyeonggi(i)&&mapCourtProperty(i));
const keys=new Set(items.map(i=>i.key));
const media=(await read('data/court/media/manifest.json',[])).filter(m=>keys.has(m.key));
const photoKeys=new Set(media.map(m=>m.key));
const photoChecks=new Map();
let files=[];try{files=await readdir('data/court/detail-batches');}catch(error){if(error.code!=='ENOENT')throw error;}
const batches=await Promise.all(files.filter(f=>f.endsWith('.json')).map(f=>read(`data/court/detail-batches/${f}`,null)));
for(const batch of batches.filter(Boolean).sort((a,b)=>a.recordedAt.localeCompare(b.recordedAt))){
 for(const check of batch.photoChecks??[])if(keys.has(check.key))photoChecks.set(check.key,check);
}
const pipeline=await read('data/court/pipeline/latest.json',null);
const lifecycle={};for(const item of items){const {state}=lifecycleFromItem(item);lifecycle[state]=(lifecycle[state]??0)+1;}
const detailed=items.filter(i=>i.detail);
const report={observedAt:new Date().toISOString(),scope:'seoul-gyeonggi',complete:false,
 total:items.length,details:{collected:detailed.length,pending:items.length-detailed.length},
 photos:{properties:photoKeys.size,files:media.length,noneVisible:[...photoChecks.values()].filter(c=>c.state==='none-visible').length,
 failed:[...photoChecks.values()].filter(c=>c.state==='failed'&&!photoKeys.has(c.key)).map(c=>c.key),
 unchecked:detailed.filter(i=>!photoKeys.has(i.key)&&!photoChecks.has(i.key)).map(i=>i.key)},
 status:{lifecycle,detailEvidence:detailed.length,allOfficialOutcomesVerified:false},
 comparisons:{lastPipelineAt:pipeline?.finishedAt??null,matchedProperties:pipeline?.matchedProperties??0,matchedTrades:pipeline?.matchedTrades??0,
 excluded:detailed.filter(i=>comparisonExclusion(i)).map(i=>({key:i.key,reason:comparisonExclusion(i)})),allTypesVerified:false},
 display:{approvedLayoutApplied:true,allPropertiesHaveCompleteEvidence:false},
 remaining:['서울·경기 전체 상세·사진 수집','공식 종료 결과 재확인','비아파트 유형별 비교 규칙 검증','전체 데이터의 화면 검수']};
await mkdir('data/court/progress',{recursive:true});
await writeFile('data/court/progress/latest.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
