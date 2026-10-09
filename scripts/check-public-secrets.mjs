import {readFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
try{process.loadEnvFile('.env.local');}catch(error){if(error.code!=='ENOENT')throw error;}
const privateValues=Object.entries(process.env).filter(([name,value])=>!name.startsWith('NEXT_PUBLIC_')&&/(KEY|SECRET|TOKEN|PASSWORD)/i.test(name)&&value?.length>=12).map(([,value])=>value);
const tracked=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
if(tracked.some(path=>path==='.env.local'||path.startsWith('data/')||path.startsWith('.pages-work/')))throw Error('Private or temporary data is tracked');
const exported=(await readdir('.pages-work/out',{recursive:true,withFileTypes:true})).filter(file=>file.isFile()).map(file=>join(file.parentPath,file.name));
const candidates=[...tracked,...exported].filter(path=>/\.(?:m?js|cjs|tsx?|json|html|css|md|txt|ya?ml|ps1|sql|example)$/.test(path));
for(const path of candidates){const text=await readFile(path,'utf8');if(privateValues.some(value=>text.includes(value))||/sb_secret_[a-zA-Z0-9_-]{12,}/.test(text))throw Error(`Private credential found in ${path}`);}
console.log(JSON.stringify({trackedFiles:tracked.length,checkedTextFiles:candidates.length,privateCredentialsFound:0}));
