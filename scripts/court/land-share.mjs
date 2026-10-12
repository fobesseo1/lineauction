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

// Land in a court item's asset list: "[토지 전 6051㎡ 갑구 53번 … 지분 6051분의 33 전부]".
// A share sale counts only the share (6051㎡ × 33/6051 = 33㎡). Several lots are summed.
// Returns {landArea, jimok, share} or null when the item lists no land.
export function courtAssetLand(assets){
 let total=0,jimok=null,share=false,found=false;
 for(const a of assets??[]){
  for(const m of String(a.raw??'').matchAll(/\[토지\s+(\S+)\s+([\d.,]+)\s*㎡([^\]]*)\]/g)){
   const area=Number(m[2].replaceAll(',',''));if(!(area>0))continue;
   const part=m[3].match(/지분\s*([\d.]+)\s*분의\s*([\d.]+)/);
   const ratio=part?Number(part[2])/Number(part[1]):1;
   if(part)share=true;
   total+=area*(Number.isFinite(ratio)&&ratio>0&&ratio<=1?ratio:1);jimok??=m[1];found=true;
  }
 }
 return found?{landArea:Math.round(total*100)/100,jimok,share}:null;
}
