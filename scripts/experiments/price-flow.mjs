// Bounded, read-only experiment. No database writes and no credential logging.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { XMLParser } from 'fast-xml-parser';
import { classifyApartmentTrade } from './comparison.mjs';
process.loadEnvFile('.env.local');
const out = 'docs/experiments/2026-10-07';
const offline = process.argv.includes('--offline');
await mkdir(out, { recursive: true });
const parser = new XMLParser({ parseTagValue: false });
const report = { capturedAt: new Date().toISOString(), probes: [], target: {
  court: '서울중앙지방법원', caseNumber: '2023타경113350', itemNumber: 1,
  address: '서울특별시 강남구 선릉로 221', complex: '도곡렉슬',
  umdNm: '도곡동', jibun: '527', area: 119.8906, floor: 9,
  minimumBidWon: 2656000000, auctionDate: '2026-10-08',
  identityStatus: 'court road address and KB complex address agree; not an official cross-source ID',
}, transactions: [], matches: [] };
report.mode = offline ? 'cached-replay' : 'live';
if (offline) report.capturedAt = JSON.parse(await readFile(`${out}/price-flow.json`,'utf8')).capturedAt;
const save = (name, value) => writeFile(`${out}/${name}`, typeof value === 'string' ? value : JSON.stringify(value, null, 2), 'utf8');
async function probe(name, url, options = {}) {
  const started = Date.now();
  try {
    const r = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
    const body = await r.text();
    report.probes.push({name, status:r.status, bytes:Buffer.byteLength(body), elapsedMs:Date.now()-started});
    return {status:r.status,body};
  } catch(e) { report.probes.push({name,error:e.name,code:e.cause?.code || null}); return null; }
}
const court = offline ? null : await probe('court-server-html', 'https://www.courtauction.go.kr/pgj/index.on');
if(court) { await save('court-shell.html',court.body); report.probes.at(-1).hasKnownCase = court.body.includes(report.target.caseNumber); }
for (const ym of ['202609','202608','202607','202606','202605','202604']) {
  const u = new URL('https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade');
  u.search = new URLSearchParams({serviceKey:process.env.MOLIT_API_KEY || '', LAWD_CD:'11680', DEAL_YMD:ym, pageNo:'1', numOfRows:'1000'}).toString();
  const result = offline ? {status:200,body:await readFile(`${out}/molit-${ym}.xml`,'utf8')} : await probe(`molit-${ym}`,u);
  if(offline) report.probes.push({name:`molit-${ym}`,cached:true});
  if(result?.status !== 200) continue;
  const data = parser.parse(result.body).response;
  const rows = data?.body?.items?.item;
  const items = Array.isArray(rows) ? rows : rows ? [rows] : [];
  const entry = report.probes.at(-1);
  entry.resultCode = data?.header?.resultCode;
  entry.totalCount = Number(data?.body?.totalCount || 0);
  entry.returned = items.length;
  entry.complete = entry.resultCode === '000' && items.length === entry.totalCount;
  await save(`molit-${ym}.xml`,result.body);
  report.transactions.push(...items.map(r=>({...r,queryMonth:ym})));
}
// Deliberately strict identity first; area tolerance is an experimental proposal.
for(const r of report.transactions) {
  const sameIdentity = r.aptNm?.replace(/\s/g,'') === report.target.complex && r.umdNm?.trim() === report.target.umdNm && r.jibun?.trim() === report.target.jibun;
  if(!sameIdentity) continue;
  const floor = Number(r.floor);
  report.matches.push({ ...r, ...classifyApartmentTrade(report.target,r,report.capturedAt.slice(0,10)),
    differences:[r.aptDong?.trim() ? `동 ${r.aptDong}`:'동 미공개',r.dealingGbn || '거래 방식 미공개',`층 차이 ${Math.abs(floor-report.target.floor)}`] });
}
report.matches.sort((a,b)=>b.date.localeCompare(a.date));
report.coverage = {months:6, completeMonths:report.probes.filter(p=>p.name.startsWith('molit-') && p.complete).length,
  sameComplexTransactions:report.matches.length, eligibleTransactions:report.matches.filter(r=>r.eligible).length,
  caveat:'Observed prices and minimum bid differ in date, floor and condition; gap is not investment return.'};
const filename = offline ? 'price-flow-replay.json' : 'price-flow.json';
await save(filename,report);
console.log(JSON.stringify({output:`${out}/${filename}`,probes:report.probes,coverage:report.coverage,latest:report.matches.filter(r=>r.eligible).slice(0,3)},null,2));
