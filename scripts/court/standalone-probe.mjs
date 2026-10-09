// User-authorized independent browser experiment; no existing browser profile or cookies.
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
const directory = 'data/court/standalone';
await mkdir(directory, {recursive:true});
const browser = await chromium.launch({channel:'msedge',headless:true});
try {
  const page = await browser.newPage({locale:'ko-KR'});
  page.setDefaultTimeout(20000);
  const responses=[];
  page.on('response',response=>{if(new URL(response.url()).hostname==='www.courtauction.go.kr')responses.push({path:new URL(response.url()).pathname,status:response.status()});});
  const started=Date.now();
  await page.goto('https://www.courtauction.go.kr/pgj/index.on',{waitUntil:'domcontentloaded',timeout:45000});
  await page.getByRole('link',{name:'대한민국 법원 경매정보',exact:true}).waitFor({timeout:30000});
  await page.locator('#mf_sbx_rletRpdtCortLst').selectOption({label:'서울중앙지방법원'});
  const buttons=await page.getByRole('button',{name:'검색하기',exact:true}).count();
  console.log(JSON.stringify({searchButtons:buttons}));
  await page.getByRole('button',{name:'검색하기',exact:true}).first().click();
  await page.getByRole('table',{name:'물건번호,소재지 및 내역,비고,용도 을(를) 나타낸 표',exact:true}).waitFor();
  await page.getByRole('combobox',{name:'페이지당 수 선택',exact:true}).selectOption('40');
  const list=page.getByRole('table',{name:'물건번호,소재지 및 내역,비고,용도 을(를) 나타낸 표',exact:true});
  await list.locator('tbody tr').first().getByRole('link').first().click();
  await page.waitForFunction(()=>document.body.innerText.includes('물건종류'));
  console.log(JSON.stringify({beforeBack:await page.getByRole('button',{name:'이전',exact:true}).evaluateAll(es=>es.map(e=>({tag:e.tagName,id:e.id,visible:!!e.getClientRects().length})))}));
  await page.getByRole('button',{name:'이전',exact:true}).last().click();
  await list.waitFor({state:'visible'});
  await page.waitForFunction(()=>document.body.innerText.includes('총 물건수'),null,{timeout:20000});
  console.log(JSON.stringify({afterBackButtons:await page.getByRole('button').evaluateAll(es=>es.filter(e=>e.getClientRects().length).map(e=>({text:e.innerText,id:e.id,tag:e.tagName,title:e.title}))),one:await page.getByRole('button',{name:'1',exact:true}).count()}));
  const body=await page.locator('body').innerText();
  const selects=await page.locator('select').evaluateAll(es=>es.map(e=>({id:e.id,options:Array.from(e.options).map(o=>({label:o.text,value:o.value}))})));
  await writeFile(`${directory}/probe.json`,JSON.stringify({observedAt:new Date().toISOString(),elapsedMs:Date.now()-started,url:page.url(),body,selects,responses},null,2));
  await page.screenshot({path:`${directory}/probe.png`,fullPage:true});
  console.log(JSON.stringify({elapsedMs:Date.now()-started,title:await page.title(),body:body.slice(0,700),selects:selects.map(s=>({id:s.id,options:s.options.slice(0,3)})),responses:responses.filter(r=>r.status>=400)}));
} finally {await browser.close();}
