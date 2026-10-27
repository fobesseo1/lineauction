import test from 'node:test';
import assert from 'node:assert/strict';
import {exposRow,isResidentialCommon,unitAreas,areaTypes} from './area-core.mjs';

const line='10021100221049|2|집합|4|전유부|서울특별시 종로구 숭인동 317-48번지|서울특별시 종로구 종로56길 37 (숭인동)|헤스티아|11110|17500|0|0317|0048||||111104100356|17501|0|37|0||205|40|각층|0|2|공용|0|주건축물|각층|21|철근콘크리트구조|철근콘크리트구조|14202|오피스텔|계단,복도|4.7871|20220813';
const row=(pk,kind,area,etc='',floor='20',code='02001')=>({pnu:'p',pk,kind,area,etc_purpose:etc,floor_kind:floor,main_purpose_code:code});

test('exposRow builds the PNU and keeps the unit fields',()=>{
 const r=exposRow(line);
 assert.equal(r.pnu,'1111017500103170048');
 assert.equal(r.pk,'10021100221049');
 assert.equal(r.ho,'205');
 assert.equal(r.kind,'2');
 assert.equal(r.etc_purpose,'계단,복도');
 assert.equal(r.area,4.7871);
 assert.equal(exposRow(line.replace('|0|0317|','|1|0317|')).pnu,'1111017500203170048');
 assert.equal(exposRow('a|b'),null);
});

test('isResidentialCommon keeps 지상 stairs and halls, drops 지하 and 기타공용',()=>{
 assert.ok(isResidentialCommon(row('1','2',15,'계단실,승강기','40')));
 assert.ok(isResidentialCommon(row('1','2',2,'벽체')));
 assert.ok(!isResidentialCommon(row('1','2',3,'지하계단실','10')));
 assert.ok(!isResidentialCommon(row('1','2',25,'지하주차장','')));
 assert.ok(!isResidentialCommon(row('1','2',1,'계단실,복도,펌프실,기전실,주차장','40')));
 assert.ok(!isResidentialCommon(row('1','2',1,'경비실')));
 assert.ok(!isResidentialCommon(row('1','1',84,'계단')));
});

test('unitAreas sums 전유 and 주거공용 per unit and keeps only 공동주택',()=>{
 const units=unitAreas([
  row('a','1',84.97),row('a','2',16.5,'계단실','40'),row('a','2',30,'지하주차장','10'),
  row('b','1',30,'','20','03001'),row('b','2',5,'계단'),
  row('c','2',4,'계단'),
 ]);
 assert.deepEqual(units,[{pnu:'p',exclusive:84.97,supply:101.47}]);
});

test('areaTypes picks the most common supply per 전용 type and drops types without 주거공용',()=>{
 const u=(e,s)=>({exclusive:e,supply:s});
 const types=areaTypes([u(59.98,79.5),u(59.98,79.5),u(59.98,80.1),u(84.97,112.3),u(40,40),u(40,40),u(50,52)]);
 assert.deepEqual(types,[
  {exclusive_area:59.98,supply_area:79.5,pyeong:24,households:3,supply_share:0.667},
  {exclusive_area:84.97,supply_area:112.3,pyeong:34,households:1,supply_share:1},
 ]);
});
