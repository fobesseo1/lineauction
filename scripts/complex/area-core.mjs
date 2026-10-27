// 건축물대장 전유공용면적 → 단지 × 전용면적 타입별 공급면적·평형·세대수.

export const EXTRACT_COLUMNS=['pnu','pk','dong','ho','floor_kind','kind','main_purpose_code','main_purpose','etc_purpose','area'];
export const PYEONG=3.3058;

// One line of the 대용량 file (pipe-separated, 39 fields) → the fields we keep, or null.
// 대지구분 0 = 대지, 1 = 산; the PNU uses 1 and 2.
export function exposRow(line){
 const f=line.split('|');
 if(f.length<38)return null;
 const [sigungu,bjdong,plat,bun,ji]=[f[8],f[9],f[10],f[11],f[12]];
 if(!/^\d{5}$/.test(sigungu)||!/^\d{5}$/.test(bjdong)||!/^\d{4}$/.test(bun)||!/^\d{4}$/.test(ji))return null;
 const area=Number(f[37]);
 if(!(area>0))return null;
 return {
  pnu:`${sigungu}${bjdong}${plat==='1'?'2':'1'}${bun}${ji}`,
  pk:f[0],dong:f[21].trim(),ho:f[22].trim(),floor_kind:f[23],kind:f[26],
  main_purpose_code:f[34],main_purpose:f[35].trim(),etc_purpose:f[36].trim().replace(/\t/g,' '),area,
 };
}

// 주거공용: the 지상 stairs, corridors, lift halls and walls a unit shares. A row naming any 기타공용 facility
// (parking, shelters, plant rooms, 관리·경비·노인정·보육 등) is left out, as is everything 지하 (층구분 10).
const RESIDENTIAL=/계단|복도|승강|엘리베이터|엘레베이터|E\/?V|홀|벽체|벽|현관|로비|전실|코아|코어|출입/i;
const OTHER=/주차|대피|기계|전기|발전|펌프|관리|경비|노인|경로|보육|어린이|주민|공동시설|변소|화장실|독서|공급실|열교환|저수|물탱크|정화|쓰레기|창고|자전거|휴게|커뮤니티|피트니스|체육|상가|근린/;
export function isResidentialCommon(row){
 if(row.kind!=='2'||row.floor_kind==='10')return false;
 const p=row.etc_purpose;
 return RESIDENTIAL.test(p)&&!OTHER.test(p);
}

const round2=x=>Math.round(x*100)/100;
// Accumulates one row into its unit (pk). Rows of a unit need not be adjacent.
export function addUnitRow(units,r){
 let u=units.get(r.pk);
 if(!u)units.set(r.pk,u={pnu:r.pnu,exclusive:0,common:0,housing:false});
 if(r.kind==='1'){u.exclusive+=r.area;if(r.main_purpose_code.startsWith('02'))u.housing=true;}
 else if(isResidentialCommon(r))u.common+=r.area;
}
// 공동주택 (용도 02xxx) units → {pnu, exclusive, supply}. Units without a 전유 row are dropped.
export function finishUnits(units){
 const out=[];
 for(const u of units.values())if(u.housing&&u.exclusive>0)out.push({pnu:u.pnu,exclusive:round2(u.exclusive),supply:round2(u.exclusive+u.common)});
 return out;
}
export function unitAreas(rows){
 const units=new Map();
 for(const r of rows)addUnitRow(units,r);
 return finishUnits(units);
}

// Units → one row per 전용면적 (소수 둘째 자리): the most common 공급면적 (ties → the larger), its share, count.
// A type whose usual 공급면적 is under 1.1 × 전용 lists little or no 주거공용 (older 대장, walls only) and is dropped.
export function areaTypes(units){
 const byType=new Map();
 for(const u of units){let t=byType.get(u.exclusive);if(!t)byType.set(u.exclusive,t=[]);t.push(u);}
 const out=[];
 for(const [exclusive,list] of byType){
  const counts=new Map();
  for(const u of list)counts.set(u.supply,(counts.get(u.supply)??0)+1);
  let best=null,bestN=0;
  for(const [s,n] of counts)if(n>bestN||(n===bestN&&s>best)){best=s;bestN=n;}
  if(best<exclusive*1.1)continue;
  out.push({exclusive_area:exclusive,supply_area:best,pyeong:Math.round(best/PYEONG),households:list.length,supply_share:Math.round(bestN/list.length*1000)/1000});
 }
 return out.sort((a,b)=>a.exclusive_area-b.exclusive_area);
}
