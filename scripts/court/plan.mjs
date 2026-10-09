import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {saveRun} from './store.mjs';
const courts=JSON.parse(await readFile(new URL('./courts.json',import.meta.url),'utf8'));
const root='data/court/runs';
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const runs=[];
const lastComplete=new Map();
for(const dir of (await readdir(root)).sort()) {
 const report=JSON.parse(await readFile(join(root,dir,'report.json'),'utf8'));
 if(report.status==='rejected')continue;
 const raw=JSON.parse(await readFile(join(root,dir,'raw.json'),'utf8'));
 const when=raw.pages?.[0]?.observedAt;
 if(report.coverage==='complete-query'&&when)lastComplete.set(raw.court,when);
 if(!when||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(when))!==day)continue;
 runs.push({raw,report,dir});
}
const complete=new Set(runs.filter(r=>r.report.coverage==='complete-query').map(r=>r.raw.court));
const court=process.argv[2]??courts.filter(c=>!complete.has(c)).sort((a,b)=>(lastComplete.get(a)??'').localeCompare(lastComplete.get(b)??'')||courts.indexOf(a)-courts.indexOf(b))[0];
if(!court) {console.log(JSON.stringify({day,complete:complete.size,total:courts.length,status:'all-courts-observed-today'}));process.exit(0);}
if(!courts.includes(court))throw Error('Unknown court');
const courtRuns=runs.filter(r=>r.raw.court===court);
const pageSize=courtRuns.at(-1)?.raw.pageSize??10;
const candidates=courtRuns.filter(r=>(r.raw.pageSize??10)===pageSize);
const pages=new Map();
for(const {raw} of candidates)for(const p of raw.pages)pages.set(p.page,p);
const last=candidates.at(-1)?.raw.pagination?.lastPage;
let nextPage=1;while(pages.has(nextPage))nextPage++;
if(process.argv.includes('--finalize')) {
 if(!last||nextPage!==last+1)throw Error('Cannot finalize incomplete court pages');
 const merged={schemaVersion:1,court,pageSize,pages:[...pages.values()].sort((a,b)=>a.page-b.page),details:{},errors:[],detailJobs:[],pagination:{startPage:1,lastPage:last,nextPage:null,reachedLastPage:true}};
 const report=await saveRun(merged);
 console.log(JSON.stringify({court,coverage:report.coverage,observed:report.observedItems,expected:report.displayedTotal}));
 if(report.coverage!=='complete-query')process.exitCode=1;
} else console.log(JSON.stringify({day,court,pageSize,startPage:nextPage,lastPage:last??null,completedCourts:[...complete],totalCourts:courts.length,needsFinalize:!!last&&nextPage===last+1,maxPages:20},null,2));
