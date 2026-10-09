// Paste waitForCourtDetail and this function literal into CUA. The caller selects the official court first.
import {waitForCourtDetail} from './detail-readiness.mjs';
export async function collectCourtDetailBatch(tab, jobs) {
  if (!Array.isArray(jobs) || !jobs.length || jobs.length > 4) throw Error('Expected 1..4 jobs');
  const {court,page,pageSize}=jobs[0];
  if (jobs.some(j=>j.court!==court||j.page!==page||j.pageSize!==pageSize)) throw Error('Batch must share court/page/size');
  const list=()=>tab.playwright.getByRole('table',{name:'물건번호,소재지 및 내역,비고,용도 을(를) 나타낸 표',exact:true}).filter({visible:true});
  const button=name=>tab.playwright.getByRole('button',{name:String(name),exact:true}).filter({visible:true});
  const pager=()=>tab.playwright.getByRole('button').filter({visible:true}).evaluateAll(es=>es.filter(e=>/^\d+$/.test(e.innerText.trim())).map(e=>({number:Number(e.innerText.trim()),selected:e.getAttribute('title')==='선택됨'})));
  async function settle(){await tab.getAXState({emit:false});}
  const size=tab.playwright.getByRole('combobox',{name:'페이지당 수 선택',exact:true});
  await size.selectOption(String(pageSize));await settle();
  async function navigate(){
    for(let step=0;step<100;step++){
      const numbers=await pager();
      if(numbers.some(p=>p.number===page&&p.selected))return;
      if(numbers.some(p=>p.number===page)){await button(page).click();await settle();continue;}
      if(!numbers.length)throw Error('Page unavailable');
      await button(page<Math.min(...numbers.map(p=>p.number))?'이전 목록':'다음 목록').click();await settle();
    }throw Error('Navigation limit');
  }
  await navigate();
  const query=await tab.playwright.getByRole('table',{name:'검색조건 을(를) 나타낸 표',exact:true}).innerText();
  if(!query.includes(court))throw Error('Court mismatch');
  const displayedTotal=Number(query.match(/총 물건수\s*([\d,]+)건/)?.[1]?.replaceAll(',',''));
  if(!Number.isInteger(displayedTotal))throw Error('Total unavailable');
  const readRows=()=>list().locator('tbody tr').filter({visible:true}).evaluateAll(es=>es.map(row=>Array.from(row.querySelectorAll('td')).map(c=>({text:c.innerText,rowSpan:c.rowSpan,links:Array.from(c.querySelectorAll('a')).map(a=>a.innerText)}))));
  let rows=await readRows();await settle();
  // The pager may update before WebSquare replaces its table body.
  for(let attempt=0;attempt<5;attempt++){
    const next=await readRows();
    if(JSON.stringify(rows)===JSON.stringify(next))break;
    rows=next;await settle();
  }
  if(JSON.stringify(rows)!==JSON.stringify(await readRows()))throw Error('Unstable list; refresh checkpoint');
  const run={schemaVersion:1,court,pageSize,pages:[{court,page,displayedTotal,rows,observedAt:new Date().toISOString(),sourceUrl:await tab.url()}],details:{},detailJobs:[],errors:[],pagination:{startPage:page,nextPage:null,reachedLastPage:false}};
  const media=[],photoChecks=[];
  for(const job of jobs){
    const rowIndex=rows.findIndex(c=>c.length===8&&c[1].text.match(/\d{4}타경\d+/)?.[0]===job.caseNumber&&Number(c[2].text.trim())===job.itemNumber);
    const detailJob={key:job.key,page,state:'failed',attempts:1};run.detailJobs.push(detailJob);
    try{
      if(rowIndex<0)throw Error('Item moved or disappeared; refresh full court list before retry');
      const address=rows[rowIndex][3].links?.[0]?.trim();if(!address)throw Error('Address link unavailable');
      await list().locator('tbody tr').filter({visible:true}).nth(rowIndex).getByRole('link',{name:address,exact:true}).click();await settle();
      const raw=await waitForCourtDetail(tab,job);
      if(!raw.includes(job.caseNumber)||!raw.replace(/\s/g,'').includes(`물건번호${job.itemNumber}물건종류`))throw Error('Detail identity mismatch');
      run.details[job.key]=raw;detailJob.state='succeeded';
      try{
        const entries=await tab.playwright.getByRole('img').filter({visible:true}).evaluateAll(es=>es.filter(e=>/^(전경도|관련사진)_\d+$/.test(e.alt)&&e.src.startsWith('data:image/')).slice(0,1).map(e=>({alt:e.alt,parts:e.src.match(/.{1,24000}/g)})));
        const photos=entries.map(e=>({alt:e.alt,dataUrl:e.parts.join('')}));
        if(photos.some(p=>p.dataUrl.includes('[Truncated]')))throw Error('Truncated photo');
        if(photos.length)media.push({kind:'court-media',key:job.key,court,caseNumber:job.caseNumber,itemNumber:job.itemNumber,detailRaw:raw,sourceUrl:await tab.url(),observedAt:new Date().toISOString(),photos});
        photoChecks.push({key:job.key,state:photos.length?'captured':'none-visible',count:photos.length});
      }catch(error){photoChecks.push({key:job.key,state:'failed',message:error.message});}
    }catch(error){detailJob.error=error.message;run.errors.push({stage:'detail',key:job.key,page,message:error.message});}
    if(!await list().isVisible()){await button('이전').last().click();await settle();await list().waitFor({state:'visible',timeoutMs:15000});}
    await navigate();
    if(JSON.stringify(await readRows())!==JSON.stringify(rows))throw Error('List changed during details; discard batch and refresh');
  }
  return{kind:'court-detail-batch',run,media,photoChecks};
}
