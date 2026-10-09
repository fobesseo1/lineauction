// Pass a connected CUA tab. All browser actions use its documented API.
import {waitForCourtDetail} from './detail-readiness.mjs';
export async function collectCourtPages(tab, options = {}) {
  const { court = '서울중앙지방법원', startPage = 1, maxPages = 10,
    detailCases = 'all', maxDetails = 4, detailAttempts = 2, onlyDetailKeys = null } = options;
  if (!Number.isInteger(startPage) || startPage < 1 || !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100
    || !Number.isInteger(maxDetails) || maxDetails < 0 || !Number.isInteger(detailAttempts) || detailAttempts < 1 || detailAttempts > 3)
    throw new Error('Invalid bounded collection options');
  if (detailCases !== 'all' && !Array.isArray(detailCases)) throw new Error('Invalid detailCases');
  const tableName = '물건번호,소재지 및 내역,비고,용도 을(를) 나타낸 표';
  const list = () => tab.playwright.getByRole('table', { name: tableName, exact: true }).filter({ visible: true });
  const button = name => tab.playwright.getByRole('button', { name: String(name), exact: true }).filter({ visible: true });
  const run = { schemaVersion: 1, court, pages: [], details: {}, errors: [], detailJobs: [], pagination: {} };
  const signatures = new Set();
  const pager = () => tab.playwright.getByRole('button').filter({ visible: true }).evaluateAll(elements => elements
    .filter(e => /^\d+$/.test(e.innerText.trim()))
    .map(e => ({ number: Number(e.innerText.trim()), selected: e.getAttribute('title') === '선택됨' })));
  async function settled() {
    for (let attempt = 0; attempt < 30; attempt++) {
      const screen = await tab.playwright.domSnapshot();
      if (!screen.includes('조회중입니다.')) return;
    }
    throw new Error('Court page did not finish loading');
  }
  async function navigate(target) {
    await list().waitFor({ state: 'visible', timeoutMs: 10000 });
    for (let step = 0; step < 100; step++) {
      await settled();
      const numbers = (await pager()).map(p => p.number);
      if (!numbers.length) throw new Error('Pagination unavailable');
      if (numbers.includes(target)) {
        await button(target).click(); await settled();
        if (!(await pager()).some(p => p.number === target && p.selected)) throw new Error('Wrong selected page');
        return;
      }
      const name = target < Math.min(...numbers) ? '이전 목록' : '다음 목록';
      await button(name).click(); await settled();
      const after = (await pager()).map(p => p.number);
      if (JSON.stringify(after) === JSON.stringify(numbers)) throw new Error('Pagination did not advance');
    }
    throw new Error('Pagination safety limit reached');
  }
  async function recover(page) {
    if (!await list().isVisible()) {
      await button('이전').first().click(); await settled();
    }
    await list().waitFor({ state: 'visible', timeoutMs: 10000 });
    await navigate(page);
  }
  let attemptsUsed = 0;
  const seenJobs = new Set();
  try {
    await button('마지막 페이지').click(); await settled();
    const end = await pager();
    const lastPage = end.find(p => p.selected)?.number;
    if (!lastPage || lastPage !== Math.max(...end.map(p => p.number))) throw new Error('Last page not verified');
    run.pagination.lastPage = lastPage;
    run.pagination.startPage = startPage;
    if (startPage > lastPage) throw new Error('Start page exceeds last page');
    await button('첫 페이지').click(); await settled();
    for (let page = startPage; page <= lastPage && page < startPage + maxPages; page++) {
      try {
        await navigate(page);
        const query = await tab.playwright.getByRole('table', { name: '검색조건 을(를) 나타낸 표', exact: true }).innerText();
        if (!query.includes(court)) throw new Error('Court/query mismatch');
        const displayedTotal = Number(query.match(/총 물건수\s*([\d,]+)건/)?.[1]?.replaceAll(',', ''));
        if (!Number.isInteger(displayedTotal)) throw new Error('Result count unavailable');
        // WebSquare retains stale hidden rows. Filter BEFORE reading cells.
        const rows = await list().locator('tbody tr').filter({ visible: true }).evaluateAll(elements => elements
          .map(row => Array.from(row.querySelectorAll('td')).map(cell => ({ text: cell.innerText, rowSpan: cell.rowSpan,
            links: Array.from(cell.querySelectorAll('a')).map(a => a.innerText) }))));
        const signature = JSON.stringify(rows);
        if ((!rows.length && displayedTotal !== 0) || signatures.has(signature)) throw new Error('Empty/repeated result page');
        signatures.add(signature);
        run.pages.push({ court, page, displayedTotal, rows, observedAt: new Date().toISOString(), sourceUrl: await tab.url() });
        for (const [rowIndex, cells] of rows.entries()) {
          if (cells.length !== 8) continue;
          const caseNumber = cells[1].text.match(/\d{4}타경\d+/)?.[0];
          if (!caseNumber || !/^\d+$/.test(cells[2].text.trim())) continue;
          const itemNumber = Number(cells[2].text.trim());
          const key = `${court}:${caseNumber}:${itemNumber}`;
          if (seenJobs.has(key)) continue;
          if ((detailCases !== 'all' && !detailCases.includes(caseNumber)) || (onlyDetailKeys && !onlyDetailKeys.includes(key))) continue;
          const job = { key, page, state: 'pending', attempts: 0 };
          run.detailJobs.push(job);
          seenJobs.add(key);
          if (attemptsUsed >= maxDetails) continue;
          attemptsUsed++;
          const addresses = [];
          for (let index = rowIndex; index < rows.length; index++) {
            const asset = rows[index];
            if (index > rowIndex && asset.length === 8 && /\d{4}타경\d+/.test(asset[1].text)) break;
            if (asset.length === 8 && asset[3].links?.[0]) addresses.push({ rowIndex: index, address: asset[3].links[0].trim() });
          }
          for (let attempt = 1; attempt <= detailAttempts; attempt++) {
            job.attempts = attempt;
            try {
              // Some bundled land links do not open detail; try the observed building link next.
              const candidate = addresses[Math.min(attempt - 1, addresses.length - 1)];
              if (!candidate) throw new Error('Detail address link unavailable');
              await list().locator('tbody tr').filter({ visible: true }).nth(candidate.rowIndex)
                .getByRole('link', { name: candidate.address, exact: true }).click();
              await settled();
              const raw = await waitForCourtDetail(tab,{caseNumber,itemNumber});
              run.details[key] = raw;
              job.state = 'succeeded';
              delete job.error;
            } catch (error) { job.error = error.message; }
            await recover(page);
            if (job.state === 'succeeded') break;
          }
          if (job.state !== 'succeeded') {
            job.state = 'failed';
            run.errors.push({ stage: 'detail', key, page, message: job.error });
          }
        }
      } catch (error) {
        run.errors.push({ stage: 'list', page, message: error.message });
        break;
      }
    }
  } catch (error) { run.errors.push({ stage: 'pagination', message: error.message }); }
  const lastCollected = run.pages.at(-1)?.page;
  const failedPage = run.errors.find(e => e.stage === 'list')?.page;
  run.pagination.nextPage = failedPage ?? (lastCollected ? lastCollected < run.pagination.lastPage ? lastCollected + 1 : null : startPage);
  run.pagination.reachedLastPage = !failedPage && lastCollected === run.pagination.lastPage;
  run.retryDetailKeys = run.detailJobs.filter(j => j.state !== 'succeeded').map(j => j.key);
  return run;
}
