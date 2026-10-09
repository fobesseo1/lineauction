import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { saveRun } from './store.mjs';
import { saveMedia } from './media.mjs';
import { saveResults } from './results.mjs';
import { planDetails } from './detail-plan.mjs';
import { planPhotos } from './photo-plan.mjs';
import { createTransferAssembler } from './transfer.mjs';

const [command, input] = process.argv.slice(2);
function summarize(report) {
  return { runPath: report.runPath, currentPath: report.currentPath, court: report.court,
    observedItems: report.observedItems, displayedTotal: report.displayedTotal, coverage: report.coverage,
    detailCount: report.detailCount, pendingDetailCount: report.pendingDetails?.length ?? 0,
    pagination: report.pagination, errorCount: report.errors.length,
    events: report.events.reduce((counts, event) => { counts[event.type] = (counts[event.type] ?? 0) + 1; return counts; }, {}) };
}
if (command === 'photo-queue') {
  const state = JSON.parse(await readFile('data/court/current.json', 'utf8'));
  const coverage = JSON.parse(await readFile('data/court/coverage.json', 'utf8'));
  const media = JSON.parse(await readFile('data/court/media/manifest.json', 'utf8'));
  let files = [];
  try { files = await readdir('data/court/detail-batches'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const batches = await Promise.all(files.filter(file => file.endsWith('.json')).map(async file => JSON.parse(await readFile(`data/court/detail-batches/${file}`, 'utf8'))));
  console.log(JSON.stringify(planPhotos(state, { media, batches, courtCoverage: coverage.courts }), null, 2));
} else if (command === 'queue') {
  const state = JSON.parse(await readFile('data/court/current.json', 'utf8'));
  const coverage = JSON.parse(await readFile('data/court/coverage.json','utf8'));
  console.log(JSON.stringify(planDetails(state,{courtCoverage:coverage.courts,scope:process.argv.includes('--all')?'all':'seoul-gyeonggi'}), null, 2));
} else if (command === 'import' && input) {
  console.log(JSON.stringify(summarize(await saveRun(JSON.parse(await readFile(input, 'utf8')))), null, 2));
} else if (command === 'browser-source') {
  // Paste this function into CUA, then call it with the connected court tab.
  console.log((await readFile(new URL('./browser.mjs', import.meta.url), 'utf8')).replace('export async function', 'async function'));
} else if (command === 'receive') {
  const portArgument = process.argv.find(value => value.startsWith('--port='));
  const receiverPort = portArgument ? Number(portArgument.slice(7)) : 3001;
  if (![3001,3002,3003].includes(receiverPort)) throw Error('Receiver port must be 3001, 3002 or 3003');
  // Local UI handoff for a CUA run. No public endpoint or database credentials.
  const token = randomBytes(24).toString('hex');
  let busy = false;
  const acceptChunk=createTransferAssembler();
  const server = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${token}'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'`);
    response.setHeader('Cache-Control', 'no-store');
    if (request.headers.host !== `127.0.0.1:${receiverPort}`) { response.writeHead(403); response.end('Forbidden'); return; }
    if (request.method === 'GET' && request.url === '/queue') {
      try {
        const state = JSON.parse(await readFile('data/court/current.json','utf8'));
        const coverage = JSON.parse(await readFile('data/court/coverage.json','utf8'));
        const queue = planDetails(state,{courtCoverage:coverage.courts,scope:'seoul-gyeonggi'});
        const escaped = JSON.stringify(queue).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
        response.end(`<html lang="ko"><meta charset="utf-8"><title>서울 경기 수집 대기열</title><h1>서울 경기 수집 대기열</h1><pre>${escaped}</pre></html>`);
      } catch(error) { response.writeHead(500); response.end('Queue unavailable'); console.error(error.message); }
      return;
    }
    if (request.method === 'GET' && request.url === '/') {
      response.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><title>법원 수집 결과 저장</title><h1>법원 수집 결과 저장</h1><p>로컬 검증 도구 · 127.0.0.1 전용</p><form method="post" action="/save"><input type="hidden" name="token" value="${token}"><label for="run">수집 원문 JSON</label><textarea id="run" name="run" rows="12" cols="80" required></textarea><button>검증하고 저장</button></form><pre id="result"></pre><script nonce="${token}">
      const context = document.modelContext ?? navigator.modelContext;
      if(context) context.registerTool({name:'save_court_batch',description:'Validate and persist public court collection JSON to the local auction workspace, including compressed photos.',inputSchema:{type:'object',properties:{json:{type:'string'}},required:['json']},execute:async({json})=>{
        const response=await fetch('/save',{method:'POST',body:new URLSearchParams({token:document.querySelector('input[name="token"]').value,run:json})});
        const html=await response.text();const parsed=new DOMParser().parseFromString(html,'text/html');
        const result=parsed.querySelector('pre')?.textContent??parsed.body.textContent;
        document.getElementById('result').textContent=result;
        if(!response.ok)throw Error('Local validation rejected the batch');
        return result;
      }});
      </script></html>`);
      return;
    }
    if (request.method !== 'POST' || request.url !== '/save' || request.headers.origin !== `http://127.0.0.1:${receiverPort}`) {
      response.writeHead(403); response.end('Forbidden'); return;
    }
    if (busy) { response.writeHead(409); response.end('Save already in progress'); return; }
    busy = true;
    try {
      let body = '';
      for await (const chunk of request) {
        body += chunk.toString('utf8');
        if (Buffer.byteLength(body) > 8 * 1024 * 1024) throw new Error('Run exceeds 8 MB');
      }
      const form = new URLSearchParams(body);
      if (form.get('token') !== token) throw new Error('Invalid local token');
      let payload = JSON.parse(form.get('run'));
      if(payload.kind==='court-transfer-chunk'){
        const transfer=acceptChunk(payload);
        if(!transfer.payload){response.end(`<html lang="ko"><meta charset="utf-8"><h1>전송 조각 수신</h1><pre>${JSON.stringify({received:transfer.received,total:transfer.total})}</pre></html>`);return;}
        payload=transfer.payload;
      }
      let summary;
      if(payload.kind==='court-detail-batch'){
        if(!Array.isArray(payload.media)||payload.media.length>4||!Array.isArray(payload.photoChecks)||payload.photoChecks.length>4)throw Error('Invalid detail media batch');
        if(payload.media.some(entry=>!payload.run?.details?.[entry.key]))throw Error('Media must belong to a collected detail');
        // Detail identity is validated and persisted before its media can be accepted.
        summary={...summarize(await saveRun(payload.run)),media:[],photoChecks:payload.photoChecks??[],photoErrors:[]};
        for(const entry of payload.media){
          try{summary.media.push(await saveMedia(entry));}catch(error){summary.photoErrors.push({key:entry.key,message:error.message});}
        }
        summary.status=summary.errorCount||summary.photoErrors.length||summary.photoChecks.some(p=>p.state==='failed')?'partial':'completed';
        await mkdir('data/court/detail-batches',{recursive:true});
        await writeFile(`data/court/detail-batches/${randomUUID()}.json`,JSON.stringify({recordedAt:new Date().toISOString(),...summary},null,2));
      }else summary = payload.kind === 'court-media' ? await saveMedia(payload) : payload.kind === 'court-results' ? await saveResults(payload) : summarize(await saveRun(payload));
      console.log(JSON.stringify(summary));
      const escaped = JSON.stringify(summary, null, 2).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
      response.end(`<html lang="ko"><meta charset="utf-8"><title>수집 저장 완료</title><h1>수집 저장 완료</h1><pre>${escaped}</pre><a href="/">다음 수집</a></html>`);
    } catch (error) {
      console.error(error.message);
      response.writeHead(400); response.end('검증 실패. 기존 데이터는 유지됩니다. 터미널 오류를 확인하세요.');
    } finally { busy = false; }
  });
  server.listen(receiverPort, '127.0.0.1', () => console.log(`Court receiver: http://127.0.0.1:${receiverPort}`));
} else {
  console.error('Usage: node scripts/court/cli.mjs receive | browser-source | queue | import <raw.json>');
  process.exitCode = 1;
}
