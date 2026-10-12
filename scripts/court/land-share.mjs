// 대지권 면적 (land share, ㎡) from a court detail: "대지권의 비율:1. 193 분의 32.05 2. 50 분의 3.1".
// Multiple lots are summed. Returns null when the detail has no ratio.
export function landShareM2(raw){
 const text=String(raw??'');
 const start=text.indexOf('대지권의 비율');if(start<0)return null;
 const section=text.slice(start,start+400).split(/제시외|\n\s*\n\s*\n/)[0];
 const parts=[...section.matchAll(/([\d.]+)\s*분의\s*([\d.]+)/g)].map(m=>Number(m[2])).filter(Number.isFinite);
 if(!parts.length)return null;
 return Math.round(parts.reduce((a,b)=>a+b,0)*100)/100;
}
