import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
const expect=v=>({
 toBe:x=>assert.equal(v,x),toEqual:x=>assert.deepEqual(v,x),toBeNull:()=>assert.equal(v,null),
 toHaveLength:n=>assert.equal(v.length,n),toBeGreaterThan:n=>assert.ok(v>n),
 toMatchObject:o=>{for(const [k,x] of Object.entries(o))assert.deepEqual(v[k],x,k);},
});
import {contractTerm,expiryRows,feeRow,FEE_OPS,buildingRows,nameMatches,gridIndex,nearby,metres,parseCsv,tagoStops,mergeStops,isExpressRoute,schoolRow,childcareType,childcareRow,parseChildcareSheet,kinderRow,monthsBefore,schedulePlan,marketGate,matchRentalSupplies,areaRentalRows} from './core.mjs';

describe('contractTerm',()=>{
 it('reads MOLIT terms',()=>expect(contractTerm('26.10~28.10')).toEqual({start:'2026-10',end:'2028-10'}));
 it('rejects blanks and nonsense',()=>{for(const v of ['',' ',null,'26.13~28.10','28.10~26.10','abc'])expect(contractTerm(v)).toBeNull();});
});
describe('expiryRows',()=>{
 const c=(o)=>({place_id:'apt:1',kapt_code:'K',area_type:84,end:'2027-01',deposit:50000,monthly_rent:0,contract_type:'신규',deal_date:'2025-01-02',...o});
 it('groups by place, type and month and drops past months',()=>{
  const rows=expiryRows([c({}),c({deposit:60000,contract_type:'갱신',deal_date:'2025-02-01'}),c({monthly_rent:100,deposit:1000}),c({end:'2020-01'})],'2026-10');
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({contracts:3,jeonse:2,monthly:1,renewed:1,jeonse_median_deposit:55000,last_deal_date:'2025-02-01',end_month:'2027-01'});
 });
});
describe('feeRow',()=>{
 it('adds up totals and per-area values',()=>{
  const answers={getHsmpLaborCostInfoV3:{pay:'1000',bonus:'1000'},getHsmpCleaningCostInfoV3:{cleanCost:'1000'},getHsmpHeatCostInfoV3:{heatP:'500',heatC:'500'},getHsmpMonthFeeInfoV3:{sLevy:'1000'},getHsmpAccumulationTariffInfoV3:{sPer:'1.5'}};
  const r=feeRow('K','202608',answers,{management_area:100,households:2},'t');
  expect(r).toMatchObject({ym:'2026-08',labor:2000,cleaning:1000,common_total:3000,individual_total:1000,reserve_levy:1000,reserve_rate:1.5,total:5000,common_per_m2:30,total_per_m2:50,total_per_household:2500,guard:null});
 });
 it('every op has a distinct name',()=>expect(new Set(FEE_OPS.map(o=>o.op)).size).toBe(31));
 it('stays null without a filing',()=>expect(feeRow('K','202608',{},{},'t').total).toBeNull());
});
describe('buildingRows',()=>{
 it('keeps main housing buildings once',()=>{
  const items=[{mgmBldrgstPk:'1',dongNm:'101동',mainAtchGbCd:'0',mainPurpsCd:'02001',mainPurpsCdNm:'공동주택',grndFlrCnt:'20',ugrndFlrCnt:2,hhldCnt:80,useAprDay:'20100102'},{mgmBldrgstPk:'1',dongNm:'101동',mainAtchGbCd:'0',mainPurpsCd:'02001'},{mgmBldrgstPk:'2',mainAtchGbCd:'1',mainPurpsCd:'02001'},{mgmBldrgstPk:'3',mainAtchGbCd:'0',mainPurpsCd:'04000',mainPurpsCdNm:'제2종근린생활시설'}];
  const r=buildingRows('K','P',items);
  expect(r).toHaveLength(1);
  expect(r[0]).toMatchObject({dong_name:'101동',ground_floors:20,basement_floors:2,households:80,approved_on:'2010-01-02'});
 });
 it('drops register dates that are not dates',()=>{
  expect(buildingRows('K','P',[{mgmBldrgstPk:'1',mainAtchGbCd:'0',mainPurpsCd:'02001',useAprDay:'19980500'}])[0].approved_on).toBeNull();
 });
 it('matches names on shared lots',()=>{expect(nameMatches('래미안 아파트','래미안')).toBe(true);expect(nameMatches('래미안','힐스테이트')).toBe(false);});
});
describe('grid',()=>{
 it('finds points in order and honours the radius',()=>{
  const pts=[{id:'a',lat:37.5,lon:127},{id:'b',lat:37.503,lon:127},{id:'c',lat:37.6,lon:127}];
  const r=nearby(gridIndex(pts),37.5,127,1000);
  expect(r.map(x=>x.p.id)).toEqual(['a','b']);
  expect(metres(37.5,127,37.503,127)).toBeGreaterThan(300);
 });
});
describe('bus',()=>{
 it('parses CSV and filters by region',()=>{
  const rows=parseCsv('h1,h2\nGGB1,"수원,역",37.1,127.1,2026-10-20,123,31010,경기도 수원시,경기BIS\nX,부산,35.1,129,d,1,21,부산광역시,부산\n');
  const out=tagoStops([['h'],...rows.slice(1)],['경기도']);
  expect(out).toHaveLength(1);
  expect(out[0]).toMatchObject({id:'GGB1',name:'수원,역',sido:'경기도',city_code:'31010'});
 });
 it('merges same-named stops only',()=>{
  const {stops,aliases}=mergeStops([{id:'s1',name:'강남역.강남역사거리',lat:37.5,lon:127}],[{id:'g1',name:'강남역 강남역사거리',lat:37.5001,lon:127},{id:'g2',name:'다른곳',lat:37.5001,lon:127}]);
  expect(aliases.get('g1')).toBe('s1');expect(stops.map(s=>s.id)).toEqual(['s1','g2']);
 });
 it('knows express routes',()=>{expect(isExpressRoute('광역버스')).toBe(true);expect(isExpressRoute('직행좌석버스')).toBe(true);expect(isExpressRoute('마을버스')).toBe(false);});
});
describe('schools and childcare',()=>{
 it('maps a school',()=>{
  const r=schoolRow({SCHUL_CODE:'S1',SCHUL_NM:'서이초',SCHUL_KND_SC_CODE:'02',LTTUD:'37.5',LGTUD:'127',ADRCD_CD:'11650'},{COL_C_SUM:'30',COL_S_SUM:'600',COL_SUM:'20.0',COL_1:'22'},2026);
  expect(r).toMatchObject({kind:'elementary',classes:30,students:600,students_per_class:20,latitude:37.5,year:2026});
  expect(r.grade_students_per_class).toEqual({1:22});
 });
 it('maps childcare types',()=>{expect(childcareType('국공립')).toBe('public');expect(childcareType('가정')).toBe('home');expect(childcareType('민간')).toBe('private');expect(childcareType('기타')).toBe('other');});
 it('maps a daycare and a kindergarten',()=>{
  const [sheet]=parseChildcareSheet(`<table><thead><tr><th scope='col'>번호</th><th>시군구</th><th>어린이집명</th><th>어린이집유형구분</th><th>운영현황</th><th>주소</th><th>정원수</th><th>현원수</th><th>위도</th><th>경도</th><th>인가일자</th></tr></thead><tbody><tr><td align='center'>1</td><td>종로구</td><td style="x"> 창신어린이집</td><td>국공립</td><td>정상</td><td>서울 A &amp; B</td><td>30</td><td>20</td><td>37.5</td><td>127</td><td>1981-09-01</td></tr></tbody></table>`);
  expect(childcareRow(sheet,'서울특별시')).toMatchObject({name:'창신어린이집',status:'정상',address:'서울 A & B',capacity:30,current_children:20,type_code:'public',latitude:37.5,sigungu:'종로구'});
  expect(kinderRow({kinderCode:'k',kindername:'B',establish:'사립(사인)',prmstfcnt:'50',ppcnt3:'3',ppcnt4:'4',lttdcdnt:'37.5',lngtcdnt:'127'},'서울특별시','강남구')).toMatchObject({id:'kg:k',capacity:50,current_children:7,type_code:'private'});
 });
});
describe('rental supplies',()=>{
 const row=o=>({hsmpSn:1,pnu:'P',rnAdres:'서울특별시 강서구 마곡서1로 100',suplyTyNm:'국민임대',styleNm:'49A',suplyPrvuseAr:49.77,hshldCo:293,...o});
 it('matches by a lot only one complex is on',()=>{
  const {supplies}=matchRentalSupplies([row({})],[{kapt_code:'K',pnu:'P',road_address:'서울특별시 강서구 다른길 1'}]);
  expect(supplies).toHaveLength(1);expect(supplies[0]).toMatchObject({kapt_code:'K',matched_by:'pnu',area_type:49,type_households:293});
 });
 it('lets the road decide on a shared lot and leaves the rest unmatched',()=>{
  const two=[{kapt_code:'A',pnu:'P',road_address:'서울특별시 강서구 마곡서1로 100'},{kapt_code:'B',pnu:'P',road_address:'서울특별시 강서구 마곡서1로 200'}];
  expect(matchRentalSupplies([row({})],two).supplies[0].kapt_code).toBe('A');
  expect(matchRentalSupplies([row({rnAdres:'서울특별시 강서구 없는길 9'})],two).unmatched).toBe(1);
 });
 it('falls back to the road when the lot is unknown',()=>expect(matchRentalSupplies([row({pnu:'X'})],[{kapt_code:'K',pnu:'P',road_address:'서울시 강서구 마곡서1로 100(마곡동)'}]).supplies[0].matched_by).toBe('road'));
 const s=(t,area,n,sn=1)=>({hsmp_sn:sn,supply_type:t,area_type:area,type_households:n});
 const areas=[[49,187],[59,488],[84,588],[114,203]].map(([exclusive_area,households])=>({exclusive_area,households}));
 const mvalley=[s('국민임대',49,293),s('국민임대',59,293),s('장기전세',59,628),s('장기전세',84,628)];
 it('judges 마곡엠밸리6 from 유형 합계 and 전유부',()=>{
  const r=areaRentalRows('K',mvalley,areas,{rental_households:921,private_rental:0});
  expect(r.find(x=>x.area_type===114)).toMatchObject({status:'none',rental_min:0,rental_max:0});
  expect(r.find(x=>x.area_type===84)).toMatchObject({status:'has_rental',rental_min:246,rental_max:588,supply_types:['장기전세']});
  expect(r.find(x=>x.area_type===49)).toMatchObject({status:'has_rental',rental_min:0,rental_max:187});
 });
 it('calls a 평형 rental only when the numbers force it',()=>{
  const r=areaRentalRows('K',[s('국민임대',39,458)],[{exclusive_area:39.9,households:458},{exclusive_area:59.9,households:338}],{rental_households:458,private_rental:0});
  expect(r[0].status).toBe('rental_only');expect(r[1].status).toBe('none');
 });
 it('does not say none when 민간임대 or a poor match could hide rentals',()=>{
  expect(areaRentalRows('K',mvalley,areas,{rental_households:921,private_rental:10}).find(x=>x.area_type===114).status).toBe('unknown');
  expect(areaRentalRows('K',mvalley,areas,{rental_households:3000,private_rental:0}).find(x=>x.area_type===114).status).toBe('unknown');
  expect(areaRentalRows('K',mvalley,areas,null).find(x=>x.area_type===114).status).toBe('unknown');
 });
 it('gives no bounds when the totals are only roughly right',()=>expect(areaRentalRows('K',mvalley,areas,{rental_households:900,private_rental:0}).find(x=>x.area_type===84)).toMatchObject({status:'has_rental',rental_min:null,rental_max:null}));
 it('keeps a rented 평형 the 전유부 does not know',()=>expect(areaRentalRows('K',[s('국민임대',33,10)],[],null)[0]).toMatchObject({area_type:33,households:null,status:'has_rental'}));
});
describe('daily schedule',()=>{
 const plan=(minutes,o={})=>schedulePlan({minutes,day:'2026-11-07',ranDay:null,lease:null,...o});
 it('runs once a day',()=>expect(plan(800,{ranDay:'2026-11-07'})).toBe('ran-today'));
 it('forgets yesterday',()=>expect(plan(800,{ranDay:'2026-11-06'})).toBe('late'));
 it('leaves early logins to the 07:00 trigger',()=>expect(plan(419)).toBe('too-early'));
 it('runs in the window',()=>{expect(plan(420)).toBe('morning');expect(plan(449)).toBe('morning');});
 it('goes after the market job from 07:30',()=>expect(plan(450)).toBe('late'));
 it('waits inside the window too when the market job was started by hand',()=>expect(plan(430,{lease:{status:'running'}})).toBe('late'));
 it('gives the day up late at night',()=>expect(plan(1380)).toBe('too-late'));
});
describe('marketGate',()=>{
 const now=Date.parse('2026-11-07T00:00:00Z'),live={status:'running',lease_until:'2026-11-07T00:10:00Z'},gate=o=>marketGate({lease:null,lockBusy:false,nowMs:now,waitedMs:0,...o});
 it('waits while it runs here or elsewhere',()=>{expect(gate({lease:live})).toBe('wait');expect(gate({lockBusy:true})).toBe('wait');});
 it('goes once it finished or failed',()=>{expect(gate({lease:{status:'completed'}})).toBe('go');expect(gate({lease:{status:'failed'}})).toBe('go');});
 it('goes when its PC went quiet',()=>expect(gate({lease:{status:'running',lease_until:'2026-11-06T23:59:00Z'}})).toBe('go'));
 it('gives a logon start time to appear, then goes',()=>{expect(gate({waitedMs:14*60e3})).toBe('wait');expect(gate({waitedMs:15*60e3})).toBe('go');});
 it('never waits forever',()=>{expect(gate({lease:live,waitedMs:4*3600e3})).toBe('give-up');expect(gate({lease:undefined,waitedMs:4*3600e3})).toBe('give-up');expect(gate({lockBusy:true,waitedMs:4*3600e3})).toBe('give-up');});
 it('keeps waiting when the database cannot be read',()=>expect(gate({lease:undefined,waitedMs:3600e3})).toBe('wait'));
});
describe('monthsBefore',()=>{it('skips this month by default',()=>expect(monthsBefore(new Date('2026-11-06T00:00:00Z'),2)).toEqual(['202610','202609']));});
