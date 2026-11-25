// 전남 시·군을 전남광주통합특별시(코드 12)에 더한다 — 도를 여는 날 마지막에, 그 창이 "전남 받아"라고 할 때만 (2026-11-22 사용자 결정).
// 받는 순간 손님 화면에 나온다: 시도 이름이 광주와 같아(전남광주통합특별시) 꺼짐 상태로 미리 받을 수 없다.
// 매일 수집이 도는 동안 regions.json을 바꾸면 뒤 단계(좌표·학교·동네)만 전남을 받으니, 수집이 끝난 뒤에 쓴다.
//   node scripts/open-jeonnam.mjs          → 바뀔 내용만 보여 줌
//   node scripts/open-jeonnam.mjs --apply  → regions.json에 씀 (그다음 README 순서: dongs → 단지·실거래 손 실행)
// 시군구 코드: vworld LT_C_ADSIGG_INFO sig_cd like 12 (2026-11-26 조회) — 광주 5개 구 말고 22곳.
import {readFile,writeFile} from 'node:fs/promises';

export const JEONNAM={
 '목포시':'12110','여수시':'12130','순천시':'12150','나주시':'12170','광양시':'12190',
 '담양군':'12710','곡성군':'12720','구례군':'12730','고흥군':'12740','보성군':'12750','화순군':'12760','장흥군':'12770',
 '강진군':'12780','해남군':'12790','영암군':'12800','무안군':'12810','함평군':'12820','영광군':'12830','장성군':'12840',
 '완도군':'12850','진도군':'12860','신안군':'12870',
};
// 광주 상자 + 전남 땅(섬 포함). 학교·동네 시설은 타일로 나눠 받는다 (경남 '48'과 같은 크기).
export const AREA={bbox:'33.85,125.0,35.55,127.95',tiles:['33.85,125.0,34.7,126.5','33.85,126.5,34.7,127.95','34.7,125.0,35.55,126.5','34.7,126.5,35.55,127.95']};
export const COURTS=['목포지원','장흥지원','순천지원','해남지원'];

export function patch(cfg){
 const r=cfg.regions.find(x=>x.code==='12');if(!r)throw Error('NO_REGION_12');
 const name=r.name;
 for(const [n,code] of Object.entries(JEONNAM)){
  r.sigungu[`${name} ${n}`]=code;
  r.aliases[`전라남도 ${n}`]=code;
 }
 delete r.partial;
 r.partialNote=`${r.partialNote} 2026-11-26 이후: 전남 시·군 22곳을 더해 시도 전체를 받는다 (scripts/open-jeonnam.mjs).`;
 r.oldNames=[...new Set([...(r.oldNames??[]),'전라남도'])];
 r.courts=[...new Set([...r.courts,...COURTS])];
 // 역은 광주 노선 그대로('29' 노선표), 학교·동네 시설 범위만 전남까지 넓힌다.
 cfg.areas['29']={...cfg.areas['29'],...AREA};
 return cfg;
}

if(String(process.argv[1]??'').replace(/\\/g,'/').endsWith('scripts/open-jeonnam.mjs')){
 const path='scripts/regions.json';
 const before=await readFile(path,'utf8');
 const cfg=JSON.parse(before);
 const r=cfg.regions.find(x=>x.code==='12');
 if(Object.values(r.sigungu).includes('12110')){console.log(JSON.stringify({already:true}));process.exit(0);}
 const after=JSON.stringify(patch(cfg),null,2)+'\n';
 const out={sigunguAdded:Object.keys(JEONNAM).length,courtsAdded:COURTS,area29:AREA.bbox,apply:process.argv.includes('--apply')};
 if(out.apply){await writeFile(`${path}.bak-before-jeonnam`,before);await writeFile(path,after);}
 console.log(JSON.stringify(out));
}
