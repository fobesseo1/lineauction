import test from 'node:test';
import assert from 'node:assert/strict';
import {overLimit,guardDeletes} from './delete-guard.mjs';

test('a normal day passes, an emptied ledger does not', () => {
  assert.equal(overLimit({ removed: 300, total: 430000 }), false);
  assert.equal(overLimit({ removed: 430000, total: 430000 }), true);
  assert.equal(overLimit({ removed: 2279, total: 25370, ratio: 0.15 }), false);
  assert.equal(overLimit({ removed: 6199, total: 25753, ratio: 0.15 }), true);
});

test('small tables may churn below the floor', () => {
  assert.equal(overLimit({ removed: 40, total: 200 }), false);
  assert.equal(overLimit({ removed: 150, total: 200 }), true);
});

test('guardDeletes throws only when something is over', async () => {
  delete process.env.TELEGRAM_CHAT_ID;
  await guardDeletes('test', [{ name: 'a', removed: 1, total: 1000 }]);
  await assert.rejects(guardDeletes('test', [{ name: 'a', removed: 900, total: 1000 }]), /LARGE_DELETE_BLOCKED a 900\/1000/);
});
