// Parsing for the K-apt 임대·혼합 단지 file. No I/O, so scripts/complex/rental-core.test.mjs can run it offline.
export function parseCsv(text){
 const rows=[];let row=[],cell='',quoted=false;
 const src=text.replace(/^﻿/,'');
 for(let i=0;i<src.length;i++){
  const c=src[i];
  if(quoted){
   if(c==='"'&&src[i+1]==='"'){cell+='"';i++;}
   else if(c==='"')quoted=false;
   else cell+=c;
  }else if(c==='"')quoted=true;
  else if(c===','){row.push(cell);cell='';}
  else if(c==='\n'||c==='\r'){
   if(c==='\r'&&src[i+1]==='\n')i++;
   row.push(cell);rows.push(row);row=[];cell='';
  }else cell+=c;
 }
 if(cell||row.length){row.push(cell);rows.push(row);}
 return rows.filter(r=>r.some(v=>v.trim()));
}

// '181.0' → 181, '1,234' → 1234, '' → null. Anything else is an error, never a silent null.
export function toCount(value){
 const v=(value??'').trim().replace(/,/g,'');
 if(!v)return null;
 const n=Number(v);
 if(!Number.isInteger(n)||n<0)throw Error(`BAD_NUMBER:${value}`);
 return n;
}

const COLUMNS={kapt_code:'단지코드',sale_type:'분양형태',households:'세대수',sale_households:'분양세대수',rental_households:'임대세대수',public_rental:'임대세대수(공공)',private_rental:'임대세대수(민간)'};
const COUNTS=['households','sale_households','rental_households','public_rental','private_rental'];

// → {rows, errors, flagged}. Errors name the line, and the caller stops before writing anything.
// 분양세대수 in the file is 세대수 - 임대세대수, so it goes negative when K-apt's 임대세대수 is wrong (등촌주공9단지: 14450
// in 1445). Those rows stay, since the 분양형태 is still good, but their split counts become null.
export function rentalRows(text,sourceDate){
 const [header,...lines]=parseCsv(text);
 const at={};
 for(const [key,name] of Object.entries(COLUMNS)){
  at[key]=header.indexOf(name);
  if(at[key]<0)throw Error(`MISSING_COLUMN:${name}`);
 }
 const rows=[],errors=[],flagged=[],seen=new Set();
 lines.forEach((cells,i)=>{
  const line=i+2;
  if(cells.length!==header.length){errors.push(`${line}: 열 수 ${cells.length}/${header.length}`);return;}
  const kapt_code=cells[at.kapt_code].trim(),sale_type=cells[at.sale_type].trim();
  if(!/^A\d+$/.test(kapt_code))errors.push(`${line}: 단지코드 ${kapt_code}`);
  if(seen.has(kapt_code))errors.push(`${line}: 중복 ${kapt_code}`);
  seen.add(kapt_code);
  if(sale_type!=='임대'&&sale_type!=='혼합')errors.push(`${line}: 분양형태 ${sale_type}`);
  const row={kapt_code,sale_type,source_date:sourceDate};
  const rawSale=Number(cells[at.sale_households].trim().replace(/,/g,''));
  if(rawSale<0&&Number(cells[at.rental_households].trim().replace(/,/g,''))>Number(cells[at.households].trim().replace(/,/g,''))){
   flagged.push(`${line}: ${kapt_code} 세대수 ${cells[at.households]} 임대세대수 ${cells[at.rental_households]}`);
   try{row.households=toCount(cells[at.households]);}catch{errors.push(`${line}: 세대수 ${cells[at.households]}`);}
   for(const key of COUNTS)if(key!=='households')row[key]=null;
   rows.push(row);return;
  }
  for(const key of COUNTS){
   try{row[key]=toCount(cells[at[key]]);}catch{errors.push(`${line}: ${COLUMNS[key]} ${cells[at[key]]}`);}
  }
  rows.push(row);
 });
 return {rows,errors,flagged};
}

// 20261106 anywhere in the file name → 2026-11-06.
export function dateFromName(path){
 const m=path.match(/(?<!\d)(20\d{2})(\d{2})(\d{2})(?!\d)/);
 return m?`${m[1]}-${m[2]}-${m[3]}`:null;
}
