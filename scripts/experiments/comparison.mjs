// Experimental rules; not a production valuation model.
export function classifyApartmentTrade(target, trade, asOf, areaTolerance = 0.1) {
  const excluded = [];
  const clean = value => String(value ?? '').trim().replace(/\s/g, '');
  if (!target.complex || !target.umdNm || !target.jibun) excluded.push('unresolved-target-identity');
  if (clean(trade.aptNm) !== clean(target.complex) || clean(trade.umdNm) !== clean(target.umdNm) || clean(trade.jibun) !== clean(target.jibun)) excluded.push('different-complex');
  if (clean(trade.cdealType) || clean(trade.cdealDay)) excluded.push('cancelled');
  const area = Number(trade.excluUseAr);
  if (!Number.isFinite(area) || area <= 0 || Math.abs(area - target.area) > areaTolerance) excluded.push('different-area-type');
  const amountWon = Number(String(trade.dealAmount ?? '').replaceAll(',', '')) * 10000;
  if (!Number.isFinite(amountWon) || amountWon <= 0) excluded.push('invalid-price');
  const date = `${trade.dealYear}-${String(trade.dealMonth).padStart(2,'0')}-${String(trade.dealDay).padStart(2,'0')}`;
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0,10) !== date || date > asOf) excluded.push('invalid-or-future-date');
  const floor = Number(trade.floor);
  return {date, amountWon:Number.isFinite(amountWon) ? amountWon : null, areaDelta:Number.isFinite(area) ? Math.abs(area-target.area) : null,
    floorDelta:clean(trade.floor) && Number.isFinite(floor) ? Math.abs(floor-target.floor) : null,
    eligible:excluded.length === 0, excludedReasons:excluded,
    minimumBidGapPercent:excluded.length === 0 ? (1-target.minimumBidWon/amountWon)*100 : null};
}

// Court UI uses two rows per basic property and extra pairs for bundled assets.
// Input is visible td text + rowspan from the browser, not a guessed JSON endpoint.
export function parseCourtRows(rows, court) {
  const items = [];
  let pending;
  for (const cells of rows) {
    if (cells.length >= 8) {
      const caseNumber = cells[1].text.match(/\d{4}타경\d+/)?.[0];
      if (caseNumber && /^\d+$/.test(cells[2].text.trim())) {
        pending = {court,caseNumber,itemNumber:Number(cells[2].text),key:`${court}:${caseNumber}:${Number(cells[2].text)}`,
          assets:[cells[3].text],note:cells[5].text,appraisalWon:Number(cells[6].text.replaceAll(',','')),
          auctionDate:cells[7].text.match(/\d{4}\.\d{2}\.\d{2}/)?.[0] ?? null};
        items.push(pending);
      } else if (pending && cells[3].text.trim()) pending.assets.push(cells[3].text);
    } else if (cells.length === 3 && pending && cells[0].text.trim()) {
      pending.use = cells[0].text;
      pending.minimumBidWon = Number(cells[1].text.match(/[\d,]+/)?.[0].replaceAll(',',''));
      pending.status = cells[2].text;
    }
  }
  return items;
}

// Absence from a single page is not evidence of withdrawal or sale.
export function diffObservedItem(before, after) {
  if (!after) return {state:'needs-recheck',changes:[]};
  if (before.key !== after.key) throw new Error('Different property identities');
  const changes = ['minimumBidWon','auctionDate','status'].filter(k=>before[k] !== after[k]);
  return {state:changes.length ? 'changed':'unchanged',changes};
}
