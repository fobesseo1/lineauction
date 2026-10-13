import test from 'node:test';
import assert from 'node:assert/strict';
import {moveInSignal,surgeSignal,auctionSignal,score} from './core.mjs';

const now=new Date('2026-10-13T00:00:00Z');

test('move-in signals at 2 and 4 years only',()=>{
 assert.equal(moveInSignal('2024-10-20',now).type,'move-in-2y');
 assert.equal(moveInSignal('2022-09-01',now).type,'move-in-4y');
 assert.equal(moveInSignal('2025-01-01',now),null);
 assert.equal(moveInSignal(null,now),null);
});

test('surge needs 3+ recent sales and twice the usual pace',()=>{
 assert.equal(surgeSignal(2,0),null);
 assert.equal(surgeSignal(4,12),null);          // usual 3 per quarter
 assert.equal(surgeSignal(6,12).score,20);      // 2×
 assert.equal(surgeSignal(9,12).score,30);      // 3×
 assert.equal(surgeSignal(3,0).score,30);
});

test('auction signal scores fresh starts higher and score caps at 100',()=>{
 const a=auctionSignal([{source:'court',first_seen_at:'2026-10-01'},{source:'onbid',first_seen_at:'2026-01-01'}],now);
 assert.equal(a.score,35);assert.match(a.detail,/경매 1건 · 공매 1건/);
 assert.equal(auctionSignal([],now),null);
 // First seen during the initial backfill: still running, not new.
 assert.equal(auctionSignal([{source:'court',first_seen_at:'2026-10-08'}],now,{court:'2026-10-21'}).score,25);
 assert.equal(score([a,surgeSignal(9,12),moveInSignal('2024-10-20',now),{score:40}]).score,100);
});
