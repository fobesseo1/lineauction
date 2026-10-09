import {readFile,readdir,writeFile} from 'node:fs/promises';
import {collectionCoverage} from './coverage.mjs';
import {saveRun} from './store.mjs';
const initial=await collectionCoverage(),finished=[],errors=[],pending=[],groups=new Map();
const day=s=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s));
for(const dir of(await readdir('data/court/runs')).sort()){
 const report=JSON.parse(await readFile(`data/court/runs/${dir}/report.json`,'utf8'));if(report.status==='rejected')continue;
 const raw=JSON.parse(await readFile(`data/court/runs/${dir}/raw.json`,'utf8'));
 if(!raw.pages?.length||day(raw.pages[0].observedAt)!==initial.day)continue;
 let group=groups.get(raw.court);if(!group||group.pageSize!==(raw.pageSize??10)){group={pageSize:raw.pageSize??10,pages:new Map()};groups.set(raw.court,group);}
 for(const page of raw.pages)group.pages.set(page.page,page);group.last=raw.pagination?.lastPage??group.last;
}
for(const entry of initial.courts.filter(c=>!c.completeAt)){
 const group=groups.get(entry.court);let start=1;while(group?.pages.has(start))start++;
 if(!group?.last||start!==group.last+1){pending.push({court:entry.court,startPage:start,lastPage:group?.last});continue;}
 try{const result=await saveRun({schemaVersion:1,court:entry.court,pageSize:group.pageSize,pages:[...group.pages.values()].sort((a,b)=>a.page-b.page),details:{},errors:[],detailJobs:[],pagination:{startPage:1,lastPage:group.last,nextPage:null,reachedLastPage:true}});
  const summary={court:entry.court,coverage:result.coverage,observed:result.observedItems,expected:result.displayedTotal};if(result.coverage==='complete-query')finished.push(summary);else errors.push(summary);
 }catch(e){errors.push({court:entry.court,error:e.message});}
}
const coverage=await collectionCoverage(),report={finished,errors,pending,coverage:{queried:coverage.queriedCourts,complete:coverage.completeCourts,partial:coverage.partialCourts}};
await writeFile('data/court/finalization.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(errors.length)process.exitCode=1;
