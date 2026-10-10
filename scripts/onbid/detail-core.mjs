import {identity,safeOfficialUrl} from './core.mjs';
export const validManagement=value=>typeof value==='string'&&value.length<=50&&/^\d+(?:-\d+)+$/.test(value);
export function entries(v){if(Array.isArray(v))return v;if(v?.item)return entries(v.item);return v&&typeof v==='object'?[v]:[];}
export function evidence(r){
 const urls=key=>[...new Set(entries(r[key]).map(v=>safeOfficialUrl(v.urlAdr)).filter(Boolean))];
 return {photos:urls('potoUrlList').map(url=>({url,kind:new URL(url).searchParams.get('downloadImageKind')==='THNL_NM'?'thumbnail':'official'})),documents:urls('apslEvlClgList').map((url,i)=>({title:`감정평가서 ${i+1}`,url}))};
}
export function matchDetails(management,targets,rows){
 if(rows.some(r=>r.cltrMngNo!==management))throw Error('DETAIL_IDENTITY_MISMATCH');
 const indexed=new Map(rows.map(r=>[identity(r),r]));
 return targets.map(list=>({list,detail:indexed.get(identity(list))??null}));
}
