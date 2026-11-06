import test from 'node:test';
import assert from 'node:assert/strict';
import {dateFromName,parseCsv,rentalRows,toCount} from './rental-core.mjs';

const HEADER='단지코드,단지명,분양형태,세대수,분양세대수,임대세대수,임대세대수(공공),임대세대수(민간)';

test('parseCsv keeps commas inside quotes and drops the BOM',()=>{
 assert.deepEqual(parseCsv('﻿a,b\r\n"x,y",2\r\n'),[['a','b'],['x,y','2']]);
});

test('toCount reads counts written as floats and leaves blanks null',()=>{
 assert.equal(toCount('181.0'),181);
 assert.equal(toCount('1,234'),1234);
 assert.equal(toCount(''),null);
 assert.throws(()=>toCount('abc'),/BAD_NUMBER/);
 assert.throws(()=>toCount('1.5'),/BAD_NUMBER/);
});

test('rentalRows maps a row',()=>{
 const {rows,errors}=rentalRows(`${HEADER}\nA1,가,혼합,181.0,160.0,21,0,21\n`,'2026-11-06');
 assert.deepEqual(errors,[]);
 assert.deepEqual(rows[0],{kapt_code:'A1',sale_type:'혼합',source_date:'2026-11-06',households:181,sale_households:160,rental_households:21,public_rental:0,private_rental:21});
});

test('rentalRows reports bad type, bad number and duplicates by line',()=>{
 const {errors}=rentalRows(`${HEADER}\nA1,가,분양,x,0,0,0,0\nA1,나,임대,1,0,1,1,0\n`,'2026-11-06');
 assert.deepEqual(errors,['2: 분양형태 분양','2: 세대수 x','3: 중복 A1']);
});

test('rentalRows keeps a row whose 임대세대수 exceeds 세대수, with its split counts null',()=>{
 const {rows,errors,flagged}=rentalRows(`${HEADER}
A1,가,임대,1445.0,-13005.0,14450,14450,0
A2,나,임대,10,-1,5,5,0
`,'2026-11-06');
 assert.deepEqual(rows[0],{kapt_code:'A1',sale_type:'임대',source_date:'2026-11-06',households:1445,sale_households:null,rental_households:null,public_rental:null,private_rental:null});
 assert.equal(flagged.length,1);
 assert.deepEqual(errors,['3: 분양세대수 -1']);
});

test('dateFromName takes the date from the file name',()=>{
 assert.equal(dateFromName('data/x/kapt_20261106.csv'),'2026-11-06');
 assert.equal(dateFromName('data/x/kapt.csv'),null);
});
