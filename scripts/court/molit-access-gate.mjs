import { readFile, writeFile } from 'node:fs/promises';

export async function assertMolitAllowed(path) {
  try { await readFile(path, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw Error('MOLIT paused after access refusal; review required before resuming');
}

export async function recordMolitRefusal(status, path, code=null) {
  if (![403, 429].includes(status)&&String(code)!=='22') return;
  try {
    await writeFile(path, JSON.stringify({ status, code, pausedAt: new Date().toISOString(), reason: String(code)==='22'?'Official daily request quota exhausted; no automatic retry':'Official API refused access; no automatic retry' }, null, 2), { flag: 'wx' });
  } catch (error) { if (error.code !== 'EEXIST') throw error; }
}
