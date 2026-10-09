// Paste the exported function into CUA; never eval it or run a separate browser.
export async function collectCourtListBatch(tab,court,startPage=1,maxPages=20) {
 if(!Number.isInteger(startPage)||startPage<1||!Number.isInteger(maxPages)||maxPages<1||maxPages>50)throw Error('Invalid batch bounds');
 const run={schemaVersion:1,court,pages:[],details:{},errors:[],detailJobs:[],pagination:{startPage}};
 const btn=n=>tab.playwright.getByRole('button',{name:String(n),exact:true}).filter({visible:true});
 const table=tab.playwright.getByRole('table',{name:'물건번호,소재지 및 내역,비고,용도 을(를) 나타낸 표',exact:true}).filter({visible:true});
 const pager=()=>tab.playwright.getByRole('button').filter({visible:true}).evaluateAll(es=>es.filter(e=>/^\d+$/.test(e.innerText.trim())).map(e=>({n:Number(e.innerText.trim()),selected:e.title==='선택됨'})));
 async function settled(){let previous='';for(let i=0;i<40;i++){const current=await table.innerText();if(previous===current&&!await tab.playwright.getByText('조회중입니다.',{exact:true}).isVisible())return;previous=current;}throw Error('Loading timeout');}
 async function go(name,target){
  const prior=(await pager()).find(x=>x.selected)?.n,old=await table.innerText();await btn(name).click();await tab.getAXState({emit:false});let previous='';
  for(let i=0;i<60;i++){
   const current=await table.innerText(),page=(await pager()).find(x=>x.selected)?.n;
   if((target===undefined||page===target)&&(target===undefined||prior===target||current!==old)&&previous===current&&!await tab.playwright.getByText('조회중입니다.',{exact:true}).isVisible())return;
   previous=current;
  }throw Error('Page did not settle');
 }
 try {
  await settled();
  const initialQuery=await tab.playwright.getByRole('table',{name:'검색조건 을(를) 나타낸 표',exact:true}).innerText();
  if(!initialQuery.includes(court))throw Error('Wrong court');
  if(/총 물건수\s*0건/.test(initialQuery)) {
   run.pages.push({court,page:1,displayedTotal:0,rows:[],observedAt:new Date().toISOString(),sourceUrl:await tab.url()});
   run.pagination={startPage:1,lastPage:1,nextPage:null,reachedLastPage:true};return run;
  }
  await go('마지막 페이지');
  const end=await pager();run.pagination.lastPage=end.find(x=>x.selected)?.n;
  const total=Number(initialQuery.match(/총 물건수\s*([\d,]+)건/)?.[1]?.replaceAll(',',''));
  if(!run.pagination.lastPage||run.pagination.lastPage<Math.ceil(total/40)||run.pagination.lastPage!==Math.max(...end.map(x=>x.n)))throw Error('No verified last page');
  if(startPage>run.pagination.lastPage)throw Error('Cursor exceeds last page; restart court query');
  await go('첫 페이지',1);
  for(let p=startPage;p<startPage+maxPages&&p<=run.pagination.lastPage;p++) {
   let numbers=await pager();
   for(let i=0;!numbers.some(x=>x.n===p)&&i<100;i++) {
    await go(p<Math.min(...numbers.map(x=>x.n))?'이전 목록':'다음 목록');numbers=await pager();
   }
   await go(p,p);
   if(!(await pager()).some(x=>x.n===p&&x.selected))throw Error('Wrong page');
   const query=await tab.playwright.getByRole('table',{name:'검색조건 을(를) 나타낸 표',exact:true}).innerText();
   if(!query.includes(court))throw Error('Wrong court');
   const displayedTotal=Number(query.match(/총 물건수\s*([\d,]+)건/)?.[1]?.replaceAll(',',''));
   if(!Number.isInteger(displayedTotal))throw Error('No verified count');
   const readRows=()=>table.locator('tbody tr').filter({visible:true}).evaluateAll(es=>es.map(r=>Array.from(r.querySelectorAll('td')).map(c=>({text:c.innerText,rowSpan:c.rowSpan,links:Array.from(c.querySelectorAll('a')).map(a=>a.innerText)}))));
   let rows=await readRows();
   for(let retry=0;retry<5&&JSON.stringify(rows)===JSON.stringify(run.pages.at(-1)?.rows);retry++){await tab.getAXState({emit:false});rows=await readRows();}
   if(JSON.stringify(rows)===JSON.stringify(run.pages.at(-1)?.rows))throw Error('Repeated page contents');
   if(!rows.length&&displayedTotal)throw Error('Empty page');
   run.pages.push({court,page:p,displayedTotal,rows,observedAt:new Date().toISOString(),sourceUrl:await tab.url()});
  }
 } catch(e){run.errors.push({stage:'list',page:(run.pages.at(-1)?.page??startPage-1)+1,message:e.message});}
 const last=run.pages.at(-1)?.page;
 run.pagination.nextPage=last?last<run.pagination.lastPage?last+1:null:startPage;
 run.pagination.reachedLastPage=!run.errors.length&&last===run.pagination.lastPage;
 return run;
}
