import {mkdir,writeFile} from 'node:fs/promises';
import {XMLParser} from 'fast-xml-parser';
process.loadEnvFile('.env.local');
const parser=new XMLParser({parseTagValue:false});
await mkdir('data/court/region-verification',{recursive:true});
for(const region of ['41285','41287']){
 const url=new URL('https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade');
 url.search=new URLSearchParams({serviceKey:process.env.MOLIT_API_KEY,LAWD_CD:region,DEAL_YMD:'202608',pageNo:'1',numOfRows:'1000'}).toString();
 let response;try{response=await fetch(url,{signal:AbortSignal.timeout(20000)});}catch{throw Error('MOLIT request failed');}
 if(!response.ok)throw Error(`MOLIT HTTP ${response.status}`);
 const xml=await response.text(),parsed=parser.parse(xml).response;
 if(!['000','00'].includes(parsed?.header?.resultCode))throw Error('MOLIT rejected');
 let rows=parsed.body.items?.item??[];if(!Array.isArray(rows))rows=[rows];
 await writeFile(`data/court/region-verification/${region}-202608.xml`,xml);
 console.log(JSON.stringify({region,total:parsed.body.totalCount,samples:rows.filter(r=>/위시티|파밀리에/.test(r.aptNm)).map(r=>({aptNm:r.aptNm,umdNm:r.umdNm,jibun:r.jibun,sggCd:r.sggCd,area:r.excluUseAr,amount:r.dealAmount}))}));
}
