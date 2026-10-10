import {mkdir,writeFile} from 'node:fs/promises';
import {parse} from 'lossless-json';
process.loadEnvFile('.env.local');
const root='data/onbid/test-2026-10-10';
await mkdir(root,{recursive:true});
const list=process.argv.includes('--list');
const url=new URL(list?'https://apis.data.go.kr/B010003/OnbidRlstListSrvc2/getRlstCltrList2':'https://apis.data.go.kr/B010003/OnbidRlstDtlSrvc2/getRlstDtlInf2');
url.searchParams.set('serviceKey',process.env.ONBID_API_KEY);
if(list){for(const [k,v] of Object.entries({pageNo:'1',numOfRows:'100',prptDivCd:'0007,0010,0005,0004,0002,0003,0006,0008,0011,0013',dspsMthodCd:'0001',bidDivCd:process.argv.includes('--field')?'0002':'0001',pvctTrgtYn:'N',lctnSdnm:'서울특별시'}))url.searchParams.set(k,v);}else url.searchParams.set('cltrMngNo','2026-0900-052507');
url.searchParams.set('resultType','json');
const r=await fetch(url,{signal:AbortSignal.timeout(30000),redirect:'error'});
const raw=await r.text();
await writeFile(`${root}/${list?(process.argv.includes('--field')?'field-list':'list'):'detail'}-api-response.txt`,raw);
let data;try{data=parse(raw,undefined,v=>v);}catch{}
const envelope=data?.response??data;
const items=envelope?.body?.items?.item;
console.log(JSON.stringify({http:r.status,header:envelope?.header,total:envelope?.body?.totalCount,rows:Array.isArray(items)?items.length:items?1:0,first:Array.isArray(items)?items[0]:items,format:raw.trimStart().startsWith('<')?'xml':'json'}));
