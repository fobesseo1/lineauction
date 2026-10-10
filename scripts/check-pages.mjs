import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright-core';
const root=resolve('.pages-work/out');
if(process.argv.includes('--static')){
 const html=await readFile(resolve(root,'index.html'),'utf8');
 if(Buffer.byteLength(html)>200000)throw Error('Static first page exceeds 200KB');
 if(/sb_secret_|service_role/i.test(html))throw Error('Private key marker in static HTML');
 console.log(JSON.stringify({mode:'static',htmlBytes:Buffer.byteLength(html),browserChecks:'not run'}));
 process.exit(0);
}
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  const pathname=decodeURIComponent(url.pathname).replace(/^\/lineauction(?=\/|$)/,'');
  const path=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!path.startsWith(root+sep)){res.writeHead(403);res.end();return;}
  const bytes=await readFile(path);
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.json':'application/json','.woff2':'font/woff2'})[extname(path)]??'application/octet-stream');res.end(bytes);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(4173,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.route('https://fobesseo1.github.io/lineauction/**',async route=>{const path=new URL(route.request().url()).pathname.replace(/^\/lineauction/,'');try{await route.fulfill({path:resolve(root,'.'+(path==='/'?'/index.html':path))});}catch{await route.continue();}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('https://fobesseo1.github.io/lineauction/');
 await page.getByRole('heading',{name:/최근 확인된 물건 \d[\d,]*건/}).waitFor({timeout:120000});
 if(await page.locator('main a[href^="#/properties/"]').count()!==24)throw Error('Initial catalog did not contain exactly 24 cards');
 const dashboardUrl=page.url();
 await page.getByRole('textbox',{name:'지역·주소·사건번호·공매 관리번호 검색'}).fill('2025타경101619');
 await page.getByRole('button',{name:'경매·공매 검색',exact:true}).click();
 await page.getByRole('heading',{name:'검색 결과 1건'}).waitFor();
 if(page.url()!==dashboardUrl)throw Error('Dashboard search navigated away');
 await page.mouse.move(0,0);
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('button[aria-label="경매·공매 검색"]')).backgroundColor==='rgb(255, 56, 92)');
 const button=await page.getByRole('button',{name:'경매·공매 검색',exact:true}).evaluate(el=>({radius:getComputedStyle(el).borderRadius}));
 if(parseFloat(button.radius)<24)throw Error('Search button does not follow the brand design');
 await page.getByRole('button',{name:'검색 초기화'}).click();
 await page.locator('main a[href^="#/properties/"]').nth(23).waitFor();
 await page.getByRole('button',{name:/물건 더 보기/}).click();
 await page.locator('main a[href^="#/properties/"]').nth(47).waitFor();
 await mkdir('docs/qa',{recursive:true});
 await page.screenshot({path:'docs/qa/pages-desktop.png',fullPage:true});
 if(await page.locator('header').getByRole('button',{name:'새로고침',exact:true}).count())throw Error('Header refresh button remains');
 await page.locator('nav').getByRole('link',{name:'홈',exact:true}).waitFor();
 await page.getByRole('link',{name:'테스트',exact:true}).click();
 await page.getByRole('heading',{name:'테스트',exact:true}).waitFor();
 if(await page.locator('main a[href^="#/properties/"]:has(img)').count()!==4)throw Error('Verified examples missing');
 await page.locator('main a[href^="#/properties/"]:has(img)').first().click();
 await page.getByText('물건 기본정보',{exact:true}).waitFor({timeout:60000});
 if(await page.locator('#court-photos a').count()<4)throw Error('Verified example photos missing');
 await page.getByRole('link',{name:'경매물건 찾기',exact:true}).click();
 await page.getByRole('heading',{name:'경매물건 찾기',exact:true}).waitFor();
 await page.locator('main a[href^="#/properties/"]:has(img)').first().click();
 await page.getByText('물건 기본정보',{exact:true}).waitFor({timeout:60000});
 await page.screenshot({path:'docs/qa/pages-detail.png',fullPage:true});
 const map=page.locator('[aria-label$="네이버지도"]');
 await map.scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>document.querySelector('[aria-label$="네이버지도"] img')!==null,{},{timeout:30000});
 const desktopMap=await map.boundingBox();if(Math.abs(desktopMap.width/desktopMap.height-16/9)>0.02)throw Error('Desktop map ratio incorrect');
 const images=await page.locator('main img').evaluateAll(images=>images.filter(img=>!img.closest('[aria-label$="네이버지도"]')).map(img=>({src:img.getAttribute('src'),loaded:img.complete&&img.naturalWidth>0})));
 if(!images.length||images.some(img=>!img.loaded))throw Error('Detail image failed to load');
 await page.setViewportSize({width:390,height:844});
 const mobileMap=await map.boundingBox();if(Math.abs(mobileMap.width/mobileMap.height-4/3)>0.02)throw Error('Mobile map ratio incorrect');
 await page.screenshot({path:'docs/qa/pages-mobile.png',fullPage:true});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 if(overflow)throw Error('Mobile page overflows horizontally');
 for(const width of [333,768]){
  await page.setViewportSize({width,height:900});
  await page.waitForFunction(()=>{const photo=document.querySelector('header a[href="#court-photos"]'),text=photo?.nextElementSibling;if(!photo||!text)return false;const a=photo.getBoundingClientRect(),b=text.getBoundingClientRect();return Math.abs(a.y-b.y)<1&&Math.abs(a.bottom-b.bottom)<1;});
  if(await page.locator('[data-detail-updated]').evaluate(el=>getComputedStyle(el).textAlign)!=='right')throw Error('Last update is not aligned right');
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Responsive header overflows');
  await page.locator('header a[href="#court-photos"]').scrollIntoViewIfNeeded();
  await page.screenshot({path:`docs/qa/detail-header-${width}.png`});
 }
 await page.reload();await page.getByText('물건 기본정보',{exact:true}).waitFor({timeout:60000});
 if(errors.length)throw Error(errors.join('\n'));
 console.log(JSON.stringify({dashboard:true,search:true,detail:true,directLinkReload:true,images:images.length,mobileOverflow:false,browserErrors:0}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
