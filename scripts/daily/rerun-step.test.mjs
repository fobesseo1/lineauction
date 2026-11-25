import test from 'node:test';
import assert from 'node:assert/strict';
import {lastRun,STEPS} from './rerun-step.mjs';

test('lastRun picks the day\'s last finished run in KST, skipping skips and other jobs', () => {
  const h = [
    {job:'market',status:'failed',startedAt:'2026-11-23T22:30:00Z',steps:[]},
    {job:'market',status:'skipped',startedAt:'2026-11-24T02:00:00Z'},
    {job:'onbid',status:'completed',startedAt:'2026-11-24T23:49:00Z'},
    {job:'market',status:'completed',startedAt:'2026-11-24T22:30:00Z',steps:[]},
  ];
  assert.equal(lastRun(h,'market','2026-11-25').startedAt,'2026-11-24T22:30:00Z');
  assert.equal(lastRun(h,'market','2026-11-24').status,'failed');
  assert.equal(lastRun(h,'court','2026-11-25'),null);
});

test('every rerunnable step names a script the daily runner uses', async () => {
  const run = await (await import('node:fs/promises')).readFile('scripts/daily/run.mjs','utf8');
  for (const [job, steps] of Object.entries(STEPS))
    for (const [name, [script]] of Object.entries(steps))
      assert.ok(run.includes(`step('${name}','${script}'`), `${job}/${name}`);
});
