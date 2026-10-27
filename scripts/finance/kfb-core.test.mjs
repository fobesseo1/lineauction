import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseRates,bankParams} from './kfb-core.mjs';

const fixture=name=>readFileSync(new URL(`./fixtures/${name}`,import.meta.url),'utf8');

test('parseRates reads 신규취급액 score bands with base, spread and adjustment',()=>{
 const rows=parseRates(fixture('kfb-new-3banks.html'),'new');
 assert.ok(!rows.some(r=>r.bank_name==='한국산업은행'),'a bank with no lending has no rows');
 const nh=rows.filter(r=>r.bank_name==='NH농협은행');
 assert.deepEqual(nh.find(r=>r.score_band==='1000-951'),{bank_name:'NH농협은행',score_band:'1000-951',rate:5.39,base_rate:3.76,spread:3.81,adjustment:2.18,avg_score:null,cb_name:null});
 assert.deepEqual(nh.find(r=>r.score_band==='avg'),{bank_name:'NH농협은행',score_band:'avg',rate:5.45,base_rate:3.81,spread:3.79,adjustment:2.15,avg_score:941,cb_name:'KCB'});
 assert.ok(!nh.some(r=>r.score_band==='600-'),'a band shown as - is skipped');
 assert.equal(rows.filter(r=>r.bank_name==='신한은행').length,10);
});

test('parseRates reads the 잔액 table as one average per bank',()=>{
 const rows=parseRates(fixture('kfb-balance-3banks.html'),'balance');
 assert.equal(rows.length,3);
 assert.deepEqual(rows[0],{bank_name:'한국산업은행',score_band:'avg',rate:3.39,base_rate:3.19,spread:0.24,adjustment:0.03,avg_score:null,cb_name:null});
});

test('parseRates returns nothing for an unpublished month',()=>{
 assert.deepEqual(parseRates('<html>\n</html>','new'),[]);
});

test('bankParams keeps the encoded checkbox values',()=>{
 assert.deepEqual(bankParams('<input type="checkbox" name="BankName" id="b1" value="%BD%C5%C7%D1%C0%BA%C7%E0" checked>'),['%BD%C5%C7%D1%C0%BA%C7%E0']);
});
