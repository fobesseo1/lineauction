import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { reconcile } from './core.mjs';
import { setTimeout } from 'node:timers/promises';

export async function replaceFile(temporary,currentPath){
  for(let attempt=0;;attempt++)try{await rename(temporary,currentPath);return;}
  catch(error){if(!['EPERM','EBUSY','EACCES'].includes(error.code)||attempt>=5)throw error;await setTimeout(100*(attempt+1));}
}

export async function saveRun(run, directory = 'data/court') {
  await mkdir(directory, { recursive: true });
  const currentPath = join(directory, 'current.json');
  let previous;
  try { previous = JSON.parse(await readFile(currentPath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const runId = `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}`;
  const runPath = join(directory, 'runs', runId);
  await mkdir(runPath, { recursive: true });
  const json = value => JSON.stringify(value, null, 2);
  await writeFile(join(runPath, 'raw.json'), json(run), 'utf8');
  let result;
  try { result = reconcile(previous, run); }
  catch (error) {
    await writeFile(join(runPath, 'report.json'), json({ status: 'rejected', error: error.message }), 'utf8');
    throw error;
  }
  const { state, report } = result;
  await writeFile(join(runPath, 'report.json'), json(report), 'utf8');
  // Keep the last valid state if validation or writing a new run fails.
  const temporary = join(directory, `${runId}.tmp`);
  await writeFile(temporary, json(state), 'utf8');
  try { await replaceFile(temporary, currentPath); }
  catch(error){await writeFile(join(runPath,'report.json'),json({status:'rejected',error:`State persistence failed: ${error.message}`}),'utf8');throw error;}
  return { runPath, currentPath, ...report };
}
