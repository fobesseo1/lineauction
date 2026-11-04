// Refresh and warm lineestate's caches once the daily market job has refreshed the tables behind
// them: pull a lineestate clone kept only for this job (never the working folder people edit in) for
// its latest scripts/warm.mjs, which calls /api/revalidate and then opens the sitemap's pages (~10k
// complexes, 4 at a time; node only, no install). Site URL, clone folder and secret live in .env.local.
import {spawnSync} from 'node:child_process';
process.loadEnvFile('.env.local');
const site=process.env.LINEESTATE_SITE_URL,dir=process.env.LINEESTATE_DIR,secret=process.env.REVALIDATE_SECRET;
if(!site||!dir||!secret){console.error('LINEESTATE_SITE_URL, LINEESTATE_DIR or REVALIDATE_SECRET missing in .env.local');process.exit(1);}
const started=Date.now();
// A failed pull (offline, local changes) still warms with the scripts already there.
const pull=spawnSync('git',['pull','--ff-only'],{cwd:dir,encoding:'utf8',windowsHide:true,timeout:120_000});
const pulled=pull.status===0?'ok':`failed: ${(pull.stderr||pull.stdout||pull.error?.message||'').trim().split('\n').at(-1)}`;
// --og also draws the share images of the 2,000 complexes with most trades (app.complex_top, read
// with the public key). Only the secret and public keys are passed, not the rest of .env.local.
const {NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}=process.env;
const env={SystemRoot:process.env.SystemRoot,PATH:process.env.PATH,REVALIDATE_SECRET:secret,NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY};
const warm=spawnSync(process.execPath,['scripts/warm.mjs',site,'--revalidate','--og'],{cwd:dir,encoding:'utf8',windowsHide:true,timeout:60*60_000,env});
const lines=(warm.stdout+warm.stderr).split('\n').map(l=>l.trim()).filter(Boolean);
console.error(lines.join('\n'));
console.log(JSON.stringify({pull:pulled,code:warm.status,revalidate:lines.find(l=>l.startsWith('revalidate'))??null,warm:lines.filter(l=>/개 \d+초/.test(l)),seconds:Math.round((Date.now()-started)/1000)}));
process.exit(warm.status===0?0:1);
