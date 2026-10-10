import { readFile, writeFile, mkdir, cp, stat, readdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { spawn } from 'node:child_process';

// Separate build workspace keeps next dev and the collectors untouched.
const root=process.cwd(), stage=resolve(root,'.pages-work');
try { process.loadEnvFile('.env.local'); } catch (error) { if(error.code!=='ENOENT')throw error; }
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if(!url||!publishableKey?.startsWith('sb_publishable_'))throw Error('A public Supabase URL and publishable key are required');
const basePath='/lineauction';
await mkdir(join(stage,'app'),{recursive:true});await mkdir(join(stage,'sharing'),{recursive:true});
const copied=new Set();
async function copySource(relative){
 relative=relative.replaceAll('\\','/');
 if(copied.has(relative))return;copied.add(relative);
 let source=await readFile(join(root,relative),'utf8');
 if(relative==='components/property/court-detail-preview.tsx'){
  source=source.replace('import { locateAddress } from "@/lib/maps/geocode";','');
  source=source.replace('import { createPublicDetailClient as createClient } from "@/lib/supabase/public-detail";','');
  const start=source.indexOf('async function coordinates('),end=source.indexOf('// Approved detail layout');
  if(start<0||end<0)throw Error('Court detail adapter needs review');source=source.slice(0,start)+source.slice(end);
  const body=source.indexOf(' const target=targetSchema.safeParse(comparisonResult.data);');
  const header=source.indexOf('export async function CourtDetailPreview(');
  if(body<0||header<0)throw Error('Court detail adapter needs review');
  source=source.slice(0,header)+`export function CourtDetailPreview({property:p,history,photos,comparison:snapshot,position}:{property:Property;history:History[];photos:z.infer<typeof photoSchema>[];comparison:unknown;position:{latitude:number;longitude:number}|null}){\n const comparisonResult={data:snapshot,error:null};\n`+source.slice(body);
 }
 if(relative==='components/property/real-comparison.tsx'){
  source=source.replace('import { createPublicDetailClient as createClient } from "@/lib/supabase/public-detail";','').replace('export async function RealComparison','export function RealComparison');
  source=source.replace(/ const \{data,error\}=snapshot===undefined\?await .*?;\r?\n/, ' const data=snapshot,error=null;\n');
  if(source.includes('await createClient'))throw Error('Comparison adapter needs review');
 }
 source=source.replaceAll('from "next/link"','from "@/sharing/link"');
 const destination=join(stage,relative);await mkdir(dirname(destination),{recursive:true});await writeFile(destination,source);
 for(const match of source.matchAll(/(?:from\s*|import\s*)["'](@\/[^"']+|\.[^"']+)["']/g)){
  const candidate=match[1].startsWith('@/')?match[1].slice(2):join(dirname(relative),match[1]);
  if(candidate.endsWith('public-config.json')||candidate.endsWith('available-media.json'))continue;
  for(const ext of ['', '.tsx','.ts','.json','/index.ts'])try{if((await stat(join(root,candidate+ext))).isFile()){await copySource(candidate+ext);break;}}catch(error){if(error.code!=='ENOENT')throw error;}
 }
}
await cp('app/icon.svg',join(stage,'app/icon.svg'));
await copySource('sharing/public-app.tsx');await copySource('sharing/link.tsx');
// Dynamic import: keep the existing guarded server-to-public detail adapter.
await copySource('components/property/court-detail-preview.tsx');
await writeFile(join(stage,'sharing/public-config.json'),JSON.stringify({url,publishableKey,basePath}));
const files=await readdir('public/media',{recursive:true,withFileTypes:true});
const mediaPaths=files.filter(file=>file.isFile()).map(file=>'/'+join('media',resolve(file.parentPath).slice(resolve('public/media').length),file.name).replaceAll('\\','/'));
await writeFile(join(stage,'sharing/available-media.json'),JSON.stringify(mediaPaths));
await writeFile(join(stage,'app/page.tsx'),'import {PublicApp} from "@/sharing/public-app";export default function Page(){return <PublicApp/>;}');
await writeFile(join(stage,'app/layout.tsx'),'import "./globals.css";export const metadata={title:"선경매 · LINE AUCTION",description:"서울·경기 법원경매 물건·사진과 국토부 실거래 조회"};export default function Layout({children}:{children:React.ReactNode}){return <html lang="ko"><body>{children}</body></html>;}');
const css=(await readFile('app/globals.css','utf8')).replaceAll('url("/fonts/','url("/lineauction/fonts/');
await writeFile(join(stage,'app/globals.css'),css);
await writeFile(join(stage,'next.config.mjs'),`export default {output:'export',basePath:'${basePath}',trailingSlash:true,images:{unoptimized:true},turbopack:{root:${JSON.stringify(root)}},experimental:{cpus:2}};`);
await writeFile(join(stage,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2020',lib:['dom','dom.iterable','esnext'],strict:true,skipLibCheck:true,noEmit:true,esModuleInterop:true,module:'esnext',moduleResolution:'bundler',resolveJsonModule:true,jsx:'react-jsx',plugins:[{name:'next'}],paths:{'@/*':['./*']}},include:['**/*.ts','**/*.tsx','.next/types/**/*.ts'],exclude:['node_modules']}));
await cp('postcss.config.mjs',join(stage,'postcss.config.mjs'));
await cp('package.json',join(stage,'package.json'));
for(const directory of ['brand','fonts','maps'])await cp(join('public',directory),join(stage,'public',directory),{recursive:true});
// Official photo filenames are immutable. Avoid rechecking/copying every image on each build.
const stagedMedia=join(stage,'public/media');await mkdir(stagedMedia,{recursive:true});
const existingMedia=new Set((await readdir(stagedMedia,{recursive:true,withFileTypes:true})).filter(file=>file.isFile()).map(file=>resolve(file.parentPath,file.name)));
const missingMedia=files.filter(file=>file.isFile()&&!existingMedia.has(resolve(stagedMedia,resolve(file.parentPath).slice(resolve('public/media').length+1),file.name)));
for(let offset=0;offset<missingMedia.length;offset+=8)await Promise.all(missingMedia.slice(offset,offset+8).map(async file=>{const destination=resolve(stagedMedia,resolve(file.parentPath).slice(resolve('public/media').length+1),file.name);await mkdir(dirname(destination),{recursive:true});await cp(join(file.parentPath,file.name),destination);}));
const safeEnv=Object.fromEntries(Object.entries(process.env).filter(([name])=>!/(SECRET|SERVICE_ROLE|API_KEY|TOKEN|PASSWORD|CRON)/i.test(name)));
const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['node_modules/next/dist/bin/next','build',stage,'--webpack'],{stdio:'inherit',env:safeEnv,windowsHide:true});child.on('error',reject);child.on('exit',resolve);});
if(code)process.exit(code);
await writeFile(join(stage,'out','.nojekyll'),'');
await cp(join(stage,'out','index.html'),join(stage,'out','404.html'));
console.log('Public Pages build ready: .pages-work/out');
