import {readFile,readdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const localDay=s=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s));
export async function collectionCoverage(){
 const courts=JSON.parse(await readFile(new URL('./courts.json',import.meta.url),'utf8'));
 const day=localDay(new Date()),byCourt=new Map();
 for(const dir of(await readdir('data/court/runs')).sort()){
  const report=JSON.parse(await readFile(`data/court/runs/${dir}/report.json`,'utf8'));if(report.status==='rejected')continue;
  const raw=JSON.parse(await readFile(`data/court/runs/${dir}/raw.json`,'utf8'));
  const observedAt=raw.pages?.at(-1)?.observedAt;if(!observedAt||localDay(observedAt)!==day)continue;
  const prior=byCourt.get(raw.court);
  byCourt.set(raw.court,{court:raw.court,observedAt,expected:report.displayedTotal,lastPage:raw.pagination?.lastPage??null,pageSize:raw.pageSize??10,completeAt:report.coverage==='complete-query'?observedAt:prior?.completeAt??null});
 }
 const entries=courts.map(c=>byCourt.get(c)??{court:c,completeAt:null,observedAt:null});
 const result={day,totalCourts:courts.length,queriedCourts:byCourt.size,completeCourts:entries.filter(e=>e.completeAt).length,partialCourts:entries.filter(e=>e.observedAt&&!e.completeAt).length,unqueriedCourts:entries.filter(e=>!e.observedAt).length,courts:entries};
 await writeFile('data/court/coverage.json',JSON.stringify(result,null,2));return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await collectionCoverage(),null,2));
