// Load .env.local even when an editor or Windows PowerShell 5.1 (Set-Content -Encoding utf8) saved it
// with a UTF-8 BOM: the BOM would otherwise glue onto the first key ("﻿NEXT_PUBLIC_SUPABASE_URL").
// The file itself is rewritten without the BOM (nothing else changes), so the ~50 collector scripts
// that call process.loadEnvFile directly read it correctly too. The runner, watchdog and bundle tool
// load through here before any collector starts.
import {readFileSync,writeFileSync} from 'node:fs';

export function loadEnv(path='.env.local'){
 const buf=readFileSync(path);
 if(buf[0]===0xEF&&buf[1]===0xBB&&buf[2]===0xBF)writeFileSync(path,buf.subarray(3));
 process.loadEnvFile(path);
}

// node scripts/daily/env.mjs --check KEY… : exit 1 naming the keys Node cannot read (the installer
// runs this right after writing .env.local). Values are never printed.
if(process.argv[1]?.replace(/\\/g,'/').endsWith('scripts/daily/env.mjs')&&process.argv.includes('--check')){
 const keys=process.argv.slice(process.argv.indexOf('--check')+1);
 try{loadEnv();}catch(e){console.error(`.env.local을 읽지 못함: ${e.message}`);process.exit(1);}
 const missing=keys.filter(k=>!process.env[k]?.trim());
 if(missing.length){console.error(`.env.local에서 읽히지 않는 값: ${missing.join(', ')}`);process.exit(1);}
 console.log(`.env.local 확인: ${keys.length}개 값 모두 읽힘`);
}
