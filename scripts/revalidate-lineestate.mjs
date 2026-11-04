// Refresh and warm lineestate's caches once the daily market job has refreshed the tables behind
// them: pull the lineestate repo for its latest scripts/warm.mjs, which calls /api/revalidate and then
// opens the sitemap's pages (~10k complexes, 4 at a time). Site URL, repo folder and secret live in
// .env.local (the domain may change).
import {spawnSync} from 'node:child_process';
process.loadEnvFile('.env.local');
const site=process.env.LINEESTATE_SITE_URL,dir=process.env.LINEESTATE_DIR??'C:/Users/hjdh5/Desktop/lineestate',secret=process.env.REVALIDATE_SECRET;
if(!site||!secret){console.error('LINEESTATE_SITE_URL or REVALIDATE_SECRET missing in .env.local');process.exit(1);}
const started=Date.now();
// A failed pull (offline, local changes) still warms with the scripts already there.
const pull=spawnSync('git',['pull','--ff-only'],{cwd:dir,encoding:'utf8',windowsHide:true,timeout:120_000});
const pulled=pull.status===0?'ok':`failed: ${(pull.stderr||pull.stdout||pull.error?.message||'').trim().split('\n').at(-1)}`;
const warm=spawnSync(process.execPath,['scripts/warm.mjs',site,'--revalidate'],{cwd:dir,encoding:'utf8',windowsHide:true,timeout:45*60_000,env:{...process.env,REVALIDATE_SECRET:secret}});
const lines=(warm.stdout+warm.stderr).split('\n').map(l=>l.trim()).filter(Boolean);
console.error(lines.join('\n'));
console.log(JSON.stringify({pull:pulled,code:warm.status,revalidate:lines.find(l=>l.startsWith('revalidate'))??null,warm:lines.filter(l=>/개 \d+초/.test(l)),seconds:Math.round((Date.now()-started)/1000)}));
process.exit(warm.status===0?0:1);
