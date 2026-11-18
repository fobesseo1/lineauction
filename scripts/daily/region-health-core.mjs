// Region health: "0 rows" is not success (lineestate docs/metro-expansion-plan.md, 2026-11-18).
// 광주 was renamed 전남광주통합특별시 on 2026-07-01 (code 29 → 12). The old codes kept answering
// "OK, 0 rows" from MOLIT, K-APT and vworld, the factory recorded those months as loaded, and 광주 was
// silently missing until someone looked at the DB. These pure checks turn such silences into findings.
// region-health.mjs gathers the inputs; nothing here touches the network or files.

// Enabled leaf 시군구 with no MOLIT sale or rent rows in the recent months, except the known quiet ones
// (regions.json quietLeaves, e.g. 옹진군: islands with almost no apartment trades).
//   loads: [{lawd, api, total}] month_loads rows of the recent window.
export function quietTradeFindings(leaves,loads,quiet={}){
 const sum=new Map();
 for(const r of loads)if(r.api==='aptSale'||r.api==='aptRent')sum.set(r.lawd,(sum.get(r.lawd)??0)+Number(r.total??0));
 return leaves.filter(l=>!(sum.get(l.code)>0)&&!quiet[l.code])
  .map(l=>({kind:'no-trades',code:l.code,name:l.name,detail:sum.has(l.code)?'최근 달 매매·전월세 0건':'최근 달 수집 기록 없음'}));
}

// Every enabled 시도 has K-APT complexes; a partial 시도 has none outside its listed 시군구.
//   counts: {sidoName: number}, outside: {sidoName: number} (complexes of a partial region outside its 시군구).
export function complexFindings(regions,counts,outside={}){
 const out=[];
 for(const r of regions){
  if(!(counts[r.name]>0))out.push({kind:'no-complexes',code:r.code,name:r.name,detail:'단지 0곳'});
  if(r.partial&&outside[r.name]>0)out.push({kind:'partial-leak',code:r.code,name:r.name,detail:`목록 밖 시군구 단지 ${outside[r.name]}곳`});
 }
 return out;
}

// Every enabled leaf has 법정동 rows in data/geo/dongs.json (coordinates and PNUs depend on it).
export function dongFindings(leaves,table){
 return leaves.filter(l=>!(Object.keys(table?.[l.code]??{}).length>0))
  .map(l=>({kind:'no-dongs',code:l.code,name:l.name,detail:'법정동 0개 (scripts/geo/dongs.mjs 다시 실행)'}));
}

// The official 시군구 list (vworld LT_C_ADSIGG_INFO: sig_cd, sig_kor_nm, full_nm) against regions.json.
//   official: [{code, name}] where name is the full name ("경기도 수원시 장안구").
// - a region whose code returns no 시군구 at all was renamed or merged (광주 29 → 12);
// - a configured leaf missing from the list, or listed under another name, was reorganised (인천 2026-07);
// - a whole (non-partial) region with an official 시군구 we do not list gained one.
export function adminCodeFindings(regions,leavesByRegion,official){
 const out=[];
 for(const r of regions){
  const mine=official.filter(o=>o.code.startsWith(r.code));
  if(!mine.length){out.push({kind:'region-code-empty',code:r.code,name:r.name,detail:`공식 목록에 코드 ${r.code}로 시작하는 시군구 없음 (시도 이름·코드가 바뀌었는지 확인)`});continue;}
  const byCode=new Map(mine.map(o=>[o.code,o.name]));
  const leaves=leavesByRegion[r.code]??[];
  for(const l of leaves){
   if(!byCode.has(l.code))out.push({kind:'leaf-missing',code:l.code,name:l.name,detail:'공식 목록에 없음 (코드가 바뀌었는지 확인)'});
   else if(byCode.get(l.code)!==l.name)out.push({kind:'leaf-renamed',code:l.code,name:l.name,detail:`공식 이름: ${byCode.get(l.code)}`});
  }
  if(!r.partial){
   const listed=new Set(leaves.map(l=>l.code));
   for(const o of mine)if(!listed.has(o.code))out.push({kind:'leaf-new',code:o.code,name:o.name,detail:'공식 목록에만 있음 (새 시군구, regions.json에 추가 필요)'});
  }
 }
 return out;
}

// One Telegram line per finding, grouped by kind.
export function healthMessage(findings){
 const label={'no-trades':'최근 거래 0','no-complexes':'단지 0','partial-leak':'목록 밖 단지','no-dongs':'법정동 0','region-code-empty':'시도 코드 비어 있음','leaf-missing':'시군구 코드 사라짐','leaf-renamed':'시군구 이름 바뀜','leaf-new':'새 시군구'};
 return findings.slice(0,30).map(f=>`• ${label[f.kind]??f.kind}: ${f.name} (${f.code}) — ${f.detail}`).join('\n')+(findings.length>30?`\n외 ${findings.length-30}건`:'');
}
