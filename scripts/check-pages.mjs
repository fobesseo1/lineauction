import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright-core';
const root=resolve('.pages-work/out');
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
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:4173/lineauction/');
 await page.getByRole('heading',{name:'서울·경기 경매 리서치'}).waitFor({timeout:120000});
 await mkdir('docs/qa',{recursive:true});
 await page.screenshot({path:'docs/qa/pages-desktop.png',fullPage:true});
 await page.getByRole('link',{name:'경매물건 찾기',exact:true}).click();
 await page.getByRole('heading',{name:'경매물건 찾기',exact:true}).waitFor();
 await page.locator('main a[href^="#/properties/"]:has(img)').first().click();
 await page.getByText('물건 기본정보',{exact:true}).waitFor({timeout:60000});
 await page.screenshot({path:'docs/qa/pages-detail.png',fullPage:true});
 const images=await page.locator('main img').evaluateAll(images=>images.map(img=>({src:img.getAttribute('src'),loaded:img.complete&&img.naturalWidth>0})));
 if(!images.length||images.some(img=>!img.loaded))throw Error('Detail image failed to load');
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'docs/qa/pages-mobile.png',fullPage:true});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 if(overflow)throw Error('Mobile page overflows horizontally');
 await page.reload();await page.getByText('물건 기본정보',{exact:true}).waitFor({timeout:60000});
 if(errors.length)throw Error(errors.join('\n'));
 console.log(JSON.stringify({dashboard:true,search:true,detail:true,directLinkReload:true,images:images.length,mobileOverflow:false,browserErrors:0}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
