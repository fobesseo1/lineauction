// Weekly, after the full court pass (--uses=all): find apartments the court filed under another use
// (다세대, 오피스텔, 상가 ...) by matching their address to a K-APT complex, and register them.
// A registered item gets use '아파트' in data/court/current.json (the court's label stays in sourceUse),
// so the pipeline, refresh-current and alerts treat it as an apartment; the daily apartment run then
// looks it up by case number (scripts/court/standalone.mjs).
// Conservative rule: unit has 동/호 or 층/호, area >= 40㎡, no 상가/근린/지하/토지 in the text.
// Usage: node scripts/court/hidden-apartments.mjs [--dry]
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { replaceFile } from './store.mjs';
import { isApartmentUse } from '../property-section.mjs';
import { inSeoulGyeonggi } from './scope.mjs';
import { db, notifyOperator } from '../daily/factory.mjs';

const dry = process.argv.includes('--dry');
const since = process.argv.find(a => a.startsWith('--since='))?.slice(8);
const statePath = 'data/court/current.json', registryPath = 'data/court/hidden-apartments.json';
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
const sinceDay = since ?? today;

const complexes = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from('complexes').select('name,jibun_address,road_address').order('name').range(from, from + 999);
  if (error) throw error;
  complexes.push(...data);
  if (data.length < 1000) break;
}

// Key = district + street/dong + number, ignoring the city prefix and the unit part.
export const addressKeys = addr => {
  if (!addr) return [];
  const t = addr.replace(/\([^)]*\)/g, ' ').split(',')[0].replace(/\s+/g, ' ').trim().split(' ');
  const gu = t.find(w => /(구|군)$/.test(w) && !/^\d/.test(w)) ?? t.find(w => /시$/.test(w) && !/(특별시|광역시|특별자치시)$/.test(w));
  const out = [];
  for (let i = 0; i < t.length - 1; i++) if (/(로|길|동|가|리)$/.test(t[i]) && /^(산)?\d+(-\d+)?$/.test(t[i + 1])) out.push(`${gu}|${t[i]}|${t[i + 1]}`);
  return out;
};
const index = new Map();
for (const c of complexes) for (const k of [...addressKeys(c.road_address), ...addressKeys(c.jibun_address)]) if (!index.has(k)) index.set(k, c.name);

// Measured 2026-11-11: without the use/floor/letter rules about half the matches were shops and
// officetels in the same lot (하이브랜드, 미리온타워 1층, 파크하비오 에이1814호).
// 오피스텔 is the registered building use, so it is nearly always a real officetel (룩소르, 엑슬루타워,
// 하이페리온 on 2026-11-11); the few true flats it hides (송도 더샵 202동) are not worth the noise.
const NEVER_FLAT_USES = new Set(['상가', '근린시설', '오피스텔']);
const looksLikeFlat = (asset, use) => {
  const raw = String(asset.raw ?? '').replace(/\s+/g, ' ');
  const area = Number(raw.match(/([\d.]+)㎡/)?.[1]);
  if (!(area >= 40) || !/\d+호/.test(raw) || !/(동|층)/.test(raw)) return false;
  if (/상가|근린|지하|지\d+층|토지|점포|사무|관\d+층/.test(raw)) return false;
  if (/(에이|비|씨|디|[A-Za-z])-?\d+호/.test(raw)) return false; // lettered units are officetels/shops
  if (use === '상가,오피스텔,근린시설' && /(^|\s|제)[12]층/.test(raw)) return false; // low floors of mixed buildings
  return true;
};

const state = JSON.parse(await readFile(statePath, 'utf8'));
const registry = JSON.parse(await readFile(registryPath, 'utf8').catch(e => { if (e.code === 'ENOENT') return '{"items":{}}'; throw e; }));
registry.items ??= {};
registry.rejected ??= {}; // keys checked by hand and found not to be apartments; never registered again
const added = [];
for (const item of Object.values(state.items)) {
  if (registry.items[item.key] || registry.rejected[item.key] || isApartmentUse(item.use) || item.assetCategory !== 'real-estate' || !inSeoulGyeonggi(item)) continue;
  if (String(item.lastSeenAt ?? '') < sinceDay) continue; // only items in today's full pass
  if (NEVER_FLAT_USES.has(item.use) || !(item.assets ?? []).length || !item.assets.every(a => looksLikeFlat(a, item.use))) continue;
  const key = item.assets.flatMap(a => addressKeys(a.address)).find(k => index.has(k));
  if (!key) continue;
  const entry = { court: item.court, caseNumber: item.caseNumber, itemNumber: item.itemNumber, complex: index.get(key), sourceUse: item.use, address: item.assets[0].address, addedAt: today };
  added.push({ key: item.key, ...entry });
  registry.items[item.key] = entry;
}
// Drop entries the court has not shown for 30 days (sold, withdrawn or out of the list window).
const cutoff = new Date(Date.now() - 30 * 864e5).toISOString();
const removed = Object.keys(registry.items).filter(k => !state.items[k] || (state.items[k].lastSeenAt ?? '') < cutoff);
for (const k of removed) delete registry.items[k];

const summary = { complexes: complexes.length, registered: Object.keys(registry.items).length, added: added.length, removed: removed.length };
for (const a of added) console.log(`+ ${a.sourceUse} | ${a.complex} | ${a.address}`);
if (dry) { console.log(JSON.stringify(summary)); process.exit(0); }

// Items no longer registered (rejected or dropped) go back to the court's own use.
for (const item of Object.values(state.items)) if (item.hiddenApartment && !registry.items[item.key]) {
  item.use = item.sourceUse ?? item.use; delete item.hiddenApartment; delete item.sourceUse;
}
// Mark the registered items in the court state so this run's pipeline already treats them as apartments.
for (const [key, entry] of Object.entries(registry.items)) {
  const item = state.items[key];
  if (!item || item.hiddenApartment) continue;
  Object.assign(item, { hiddenApartment: { complex: entry.complex, addedAt: entry.addedAt }, sourceUse: item.use, use: '아파트' });
}
const atomic = async (path, value) => { const tmp = `${path}.${randomUUID()}.tmp`; await writeFile(tmp, JSON.stringify(value, null, 2), { flush: true }); await replaceFile(tmp, path); };
await atomic(statePath, state);
await atomic(registryPath, registry);
if (added.length) await notifyOperator([`숨은 아파트 ${added.length}건 등록 (법원 용도는 아파트가 아님)`, ...added.slice(0, 15).map(a => `• ${a.complex} · ${a.address} (${a.sourceUse})`), ...(added.length > 15 ? [`외 ${added.length - 15}건`] : []), `아파트가 아닌 게 섞였으면 알려 주세요 (rejected 목록으로 옮김).`].join('\n'));
console.log(JSON.stringify(summary)); // last line: the daily runner reads it as the step result
