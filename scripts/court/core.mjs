// Court collection is independent of Next.js and of valuation/matching rules.
export const COURT_URL = 'https://www.courtauction.go.kr/pgj/index.on';
// These official list rows use a shortened name; keep the fully selected court in identity keys.
export function courtRowMatches(text,court){
 const label=String(text).trim().split(/\s|\d{4}타경/)[0];
 const alias={'부산동부지원':'동부지원','부산서부지원':'서부지원','대구서부지원':'서부지원'};
 return label===court || label===alias[court];
}
const clean = value => String(value ?? '').trim();
export function money(value) {
  const match = clean(value).match(/^[\d,]+(?:\s*원)?(?=\s|$)/);
  const number = match ? Number(match[0].replace(/[\s,원]/g, '')) : NaN;
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}
export function date(value) {
  const match = clean(value).match(/\b(\d{4})[.-](\d{2})[.-](\d{2})\b/);
  if (!match) return null;
  const result = match.slice(1).join('-');
  const stamp = Date.parse(`${result}T00:00:00Z`);
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === result ? result : null;
}
export function parseList(snapshot) {
  if (!snapshot.court || !Array.isArray(snapshot.rows)) throw new Error('Invalid court snapshot');
  const items = [];
  let pending;
  for (const [rowIndex, cells] of snapshot.rows.entries()) {
    if (!Array.isArray(cells) || cells.some(c => typeof c.text !== 'string')) throw new Error('Invalid cells');
    if (!cells.length) continue;
    if (cells.length === 8) {
      const cases = cells[1].text.match(/\d{4}타경\d+/g) ?? [];
      const numberText = clean(cells[2].text);
      if (cases.length && /^\d+$/.test(numberText)) {
        if (!courtRowMatches(cells[1].text,snapshot.court)) throw new Error('Court/query mismatch');
        const itemNumber = Number(numberText);
        if (!Number.isSafeInteger(itemNumber) || itemNumber < 1) throw new Error('Invalid item number');
        pending = {
          key: `${snapshot.court}:${cases[0]}:${itemNumber}`, court: snapshot.court,
          caseNumber: cases[0], relatedCases: cases.slice(1), itemNumber,
          assets: [], note: clean(cells[5].text), appraisalWon: money(cells[6].text),
          auctionDate: date(cells[7].text), departmentRaw: clean(cells[7].text),
          minimumBidWon: null, use: null, status: null,
          sourceUrl: snapshot.sourceUrl, observedAt: snapshot.observedAt, page: snapshot.page,
        };
        items.push(pending);
      } else if (cases.length || numberText || !pending) {
        throw new Error(`Unrecognized identity at row ${rowIndex}`);
      }
      if (clean(cells[3].text)) pending.assets.push({
        address: clean(cells[3].links?.[0]) || clean(cells[3].text.split('\n')[0]),
        raw: clean(cells[3].text),
      });
    } else if (cells.length === 3 && pending) {
      if (cells.every(c => !clean(c.text))) continue; // Empty bundled-asset continuation.
      if (pending.use !== null) throw new Error('Unexpected second price row');
      pending.use = clean(cells[0].text);
      pending.minimumBidWon = money(cells[1].text);
      pending.status = clean(cells[2].text);
    } else {
      // Do not silently accept a changed table layout and mark the run successful.
      throw new Error(`Unsupported court row layout: ${cells.length}`);
    }
  }
  if (!items.length && snapshot.displayedTotal !== 0) throw new Error('Empty/unloaded result page');
  for (const item of items) {
    item.validationIssues = [
      !item.appraisalWon && 'missing-appraisal', !item.minimumBidWon && 'missing-minimum-bid',
      !item.auctionDate && 'missing-date', !item.use && 'missing-use',
      !item.status && 'missing-status', !item.assets.length && 'missing-address',
    ].filter(Boolean);
    item.assetCategory = /자동차|중기|선박/.test(item.use ?? '') ? 'non-real-estate' : item.use === '기타' ? 'needs-classification' : 'real-estate';
  }
  return items;
}

// Only the explicitly labelled exclusive portion is eligible as exclusive area.
export function parseDetail(raw, item) {
  const text = clean(raw);
  if (!text.includes(item.caseNumber)) throw new Error('Detail case mismatch');
  const compact = text.replace(/\s/g, '');
  const identity = compact.match(/물건번호(\d+)(?=물건종류)/)?.[1];
  if (!identity || Number(identity) !== item.itemNumber) throw new Error('Detail item mismatch');
  const exclusive = text.split('전유부분').slice(1).map(block => {
    const section = block.split(/대지권|1동의 건물/)[0];
    const amount = section.match(/면\s*적\s*[:：]?\s*([\d,.]+)\s*㎡/)?.[1];
    if (amount) return Number(amount.replaceAll(',', ''));
    // Some official entries append the sole area to '구조' inside the exclusive section.
    // An explicit missing-area label must never fall back to unrelated numbers.
    if (/면\s*적/.test(section)) return null;
    const candidates = [...section.matchAll(/([\d,.]+)\s*㎡/g)];
    return candidates.length === 1 ? Number(candidates[0][1].replaceAll(',', '')) : null;
  }).filter(n => n !== null && Number.isFinite(n) && n > 0);
  return {
    raw: text, observedAt: item.observedAt,
    exclusiveAreaM2: exclusive.length === 1 ? exclusive[0] : null,
    areaStatus: exclusive.length === 1 ? 'explicit-exclusive-area' : 'needs-review',
    // List price/date remain authoritative for this observation; never infer from past schedules.
  };
}

const tracked = ['appraisalWon', 'minimumBidWon', 'auctionDate', 'status', 'use', 'assets', 'note', 'relatedCases'];
export function reconcile(previous, run) {
  if (run.schemaVersion !== 1 || !run.court || !Array.isArray(run.pages) || !run.pages.length) throw new Error('Invalid run');
  const items = new Map();
  const pageNumbers = new Set();
  const detailErrors = [];
  let total;
  let previousPage;
  let previousLastKey;
  for (const page of run.pages) {
    const url = new URL(page.sourceUrl);
    if (url.origin !== 'https://www.courtauction.go.kr' || page.court !== run.court) throw new Error('Invalid source');
    if (!Number.isInteger(page.page) || page.page < 1 || pageNumbers.has(page.page)) throw new Error('Repeated/invalid page');
    if (!Number.isInteger(page.displayedTotal) || page.displayedTotal < 0) throw new Error('Missing result total');
    if (!Number.isFinite(Date.parse(page.observedAt))) throw new Error('Invalid observation timestamp');
    if (total !== undefined && total !== page.displayedTotal) throw new Error('Results changed during collection; retry');
    total = page.displayedTotal;
    pageNumbers.add(page.page);
    const pageItems = parseList(page);
    for (const [index, item] of pageItems.entries()) {
      if (run.details?.[item.key]) {
        try { item.detail = parseDetail(run.details[item.key], item); }
        catch (error) { detailErrors.push({ stage: 'detail', key: item.key, page: item.page, message: error.message }); }
      }
      const before = items.get(item.key);
      if (before) {
        // Bundled sale can span a page boundary; headers/prices repeat for new assets.
        const sameFields = ['appraisalWon', 'minimumBidWon', 'auctionDate', 'status', 'use', 'note', 'relatedCases']
          .every(k => JSON.stringify(before[k]) === JSON.stringify(item[k]));
        const disjoint = item.assets.every(a => !before.assets.some(b => b.raw === a.raw));
        if (index !== 0 || previousLastKey !== item.key || previousPage + 1 !== page.page || !sameFields || !disjoint)
          throw new Error('Duplicate item across pages; navigation may not have settled');
        before.assets.push(...item.assets);
        before.observedPages.push(page.page);
        before.observedAt = item.observedAt;
        if (item.detail) before.detail = item.detail;
      } else items.set(item.key, { ...item, observedPages: [page.page] });
    }
    previousPage = page.page;
    previousLastKey = pageItems.at(-1)?.key;
  }
  const errors = [...(run.errors ?? []), ...detailErrors];
  const listErrors = errors.filter(e => e.stage !== 'detail');
  const lastPage = run.pagination?.lastPage;
  const pagesComplete = !lastPage || (pageNumbers.size === lastPage && Array.from({ length: lastPage }, (_, i) => i + 1).every(p => pageNumbers.has(p)));
  const complete = items.size === total && pagesComplete && [...items.values()].every(i => !i.validationIssues.length)
    && !listErrors.length;
  const state = structuredClone(previous ?? { schemaVersion: 1, items: {} });
  state.detailQueue ??= {};
  for (const job of run.detailJobs ?? []) {
    if (!items.has(job.key) || !['pending', 'succeeded', 'failed'].includes(job.state)) throw new Error('Invalid detail job');
    const failure = detailErrors.find(e => e.key === job.key);
    const succeeded = job.state === 'succeeded' && items.get(job.key).detail;
    if (succeeded) delete state.detailQueue[job.key];
    else state.detailQueue[job.key] = { ...job, attempts: (previous?.detailQueue?.[job.key]?.attempts ?? 0) + (job.attempts ?? 0), lastAttemptAt: items.get(job.key).observedAt, state: failure ? 'failed' : job.state,
      error: failure?.message ?? job.error ?? null, court: run.court };
  }
  for (const error of detailErrors) state.detailQueue[error.key] = {
    key: error.key, court: run.court, page: error.page, state: 'failed', error: error.message,
  };
  const events = [];
  for (const item of items.values()) {
    const before = state.items[item.key];
    if (before && before.lastSeenAt > item.observedAt) throw new Error('Out-of-order observation');
    if (!complete && before) {
      // A partial batch can begin/end in the middle of a bundled sale.
      item.assets = [...before.assets, ...item.assets.filter(a => !before.assets.some(b => b.raw === a.raw))];
    }
    item.assetsStatus = complete ? 'complete-query' : 'partial-query';
    const changes = before ? tracked.filter(k => JSON.stringify(before[k]) !== JSON.stringify(item[k])) : [];
    events.push({ key: item.key, type: before ? changes.length ? 'changed' : 'unchanged' : 'new',
      changes: Object.fromEntries(changes.map(k => [k, { before: before[k], after: item[k] }])) });
    state.items[item.key] = { ...item, pageSize: run.pageSize ?? 10, firstSeenAt: before?.firstSeenAt ?? item.observedAt,
      lastSeenAt: item.observedAt, detail: item.detail ?? before?.detail ?? null,
      resultEvidence: before?.resultEvidence ?? null,
      observationStatus: item.validationIssues.length ? 'needs-review' : 'observed' };
  }
  // A full list observation also seeds missing detail jobs; no hand-picked cases needed.
  for (const item of items.values()) {
    const current = state.items[item.key];
    if (item.assetCategory === 'non-real-estate') { delete state.detailQueue[item.key]; continue; }
    if (!current.detail && !state.detailQueue[item.key]) state.detailQueue[item.key] = {
      key: item.key, court: run.court, page: item.page, state: 'pending', attempts: 0,
    };
    // A new full/list observation can move a pending item to another page.
    if (state.detailQueue[item.key]) Object.assign(state.detailQueue[item.key], {
      page: item.page, pageSize: run.pageSize ?? 10, court: run.court,
    });
  }
  // Even a complete search result is not a definitive sold/withdrawn record.
  if (complete) for (const before of Object.values(state.items)) {
    if (before.court === run.court && !items.has(before.key)) {
      before.observationStatus = 'needs-recheck';
      before.missingObservedAt = run.pages.map(p=>p.observedAt).sort().at(-1);
      events.push({ key: before.key, type: 'not-observed', changes: {} });
    }
  }
  return { state, report: { court: run.court, observedItems: items.size, displayedTotal: total,
    pages: [...pageNumbers], coverage: complete ? 'complete-query' : 'partial',
    detailCount: [...items.values()].filter(i => i.detail).length,
    detailJobCount: run.detailJobs?.length ?? 0,
    realEstateCount: [...items.values()].filter(i => i.assetCategory === 'real-estate').length,
    nonRealEstateCount: [...items.values()].filter(i => i.assetCategory === 'non-real-estate').length,
    classificationNeededCount: [...items.values()].filter(i => i.assetCategory === 'needs-classification').length,
    pendingDetails: Object.values(state.detailQueue).filter(j => j.court === run.court),
    pagination: run.pagination ?? null,
    invalidItems: [...items.values()].filter(i => i.validationIssues.length).map(i => i.key),
    errors, events } };
}
