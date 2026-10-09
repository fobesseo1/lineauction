// WebSquare can show the detail frame before its case/item values arrive.
// Read the visible contents again after an observed incomplete response.
export async function waitForCourtDetail(tab, {caseNumber, itemNumber, polls = 12}) {
  if (!/^\d{4}타경\d+$/.test(caseNumber) || !Number.isInteger(Number(itemNumber)) || Number(itemNumber) < 1)
    throw Error('Invalid detail identity');
  for (let attempt = 0; attempt < polls; attempt++) {
    const raw = await tab.playwright.getByRole('table').filter({visible:true})
      .evaluateAll(tables => tables.map(table => table.innerText).join('\n\n'));
    const displayedCase = raw.match(/사건번호\s*(\d{4}타경\d+)/)?.[1];
    if (displayedCase === caseNumber && raw.replace(/\s/g, '').includes(`물건번호${Number(itemNumber)}물건종류`)) return raw;
    if (attempt + 1 < polls) {
      await tab.playwright.waitForTimeout(500);
      await tab.getAXState({emit:false});
    }
  }
  throw Error('Court detail contents did not load with the requested case/item identity');
}
