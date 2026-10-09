import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertMolitAllowed, recordMolitRefusal } from './molit-access-gate.mjs';

for (const status of [403, 429]) test(`refusal ${status} persists across later runs`, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'molit-gate-'));
  const path = join(dir, 'pause.json');
  try {
    await assertMolitAllowed(path);
    await recordMolitRefusal(status, path);
    await assert.rejects(assertMolitAllowed(path), /paused after access refusal/);
    await recordMolitRefusal(429, path);
    assert.equal(JSON.parse(await readFile(path, 'utf8')).status, status);
  } finally { await rm(dir, { recursive: true }); }
});

test('503 does not create an access refusal pause', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'molit-gate-'));
  const path = join(dir, 'pause.json');
  try { await recordMolitRefusal(503, path); await assertMolitAllowed(path); }
  finally { await rm(dir, { recursive: true }); }
});

test('HTTP 200 with official daily quota code 22 pauses requests', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'molit-gate-'));
  const path = join(dir, 'pause.json');
  try {
    await recordMolitRefusal(200, path, '22');
    await assert.rejects(assertMolitAllowed(path), /paused after access refusal/);
    assert.equal(JSON.parse(await readFile(path, 'utf8')).code, '22');
  } finally { await rm(dir, { recursive: true }); }
});
