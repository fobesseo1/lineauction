// Map points for auction properties whose lot has no parcel point (new towns before 환지, lots merged
// after redevelopment, Onbid rows without a PNU). Pure helpers; coords.mjs does the lookups (2026-11-27).
export const bare=s=>String(s??'').replace(/\s+/g,'').replace(/아파트$/,'');

// The 읍면동/리 and lot in an address: "덕이동 1529", "정왕동 시화지구1868", "다대동 120-외 1필지".
export function lotOf(text,dong){
 const t=String(text??'').split(/\s+/);
 for(let i=0;i<t.length-1;i++){
  if(!(dong?t[i]===dong:/^\S+리$/.test(t[i])))continue;
  const m=t[i+1].match(/^(?:\S*지구)?(\d+)(?:-(\d+))?(?:-외)?$/);
  if(m)return {umd:t[i],main:m[1],sub:m[2]??null};
 }
 return null;
}

// The building name: the word before "105동" / "1821동", or the name in brackets ("(햇님아파트)").
export function buildingName(text){
 const s=String(text??'');
 const br=s.match(/\(([^()]*아파트[^()]*)\)/);if(br)return br[1].trim();
 const t=s.split(/\s+/);const i=t.findIndex((w,k)=>k>0&&/^[A-Za-z]?\d+동$/.test(w));
 return i>0&&!/^\d/.test(t[i-1])&&!/[동리가]$/.test(t[i-1])?t[i-1]:null;
}

// A road address in the text ("송학로 78").
export function roadOf(text){
 const m=String(text??'').match(/^(.*?\S+(?:로|길))\s+(\d+(?:-\d+)?)(?=\s|$)/);
 return m?`${m[1]} ${m[2]}`:null;
}

// The K-APT complex named in the address: same 시도, its 시군구 written in the address, name of 5+ letters;
// the longest name wins ("일산아이파크1단지" over "아이파크").
export function complexInAddress(text,sido,complexes){
 // Courts write "3블럭", K-APT "3BL".
 const a=bare(String(text??'').replace(/아파트/g,'').replace(/(\d)블[럭록]/g,'$1BL'));let best=null;
 for(const c of complexes){
  if(c.sido!==sido)continue;const n=bare(c.name).replace(/아파트/g,'');
  if(n.length<5||!a.includes(n)||!a.includes(bare(c.sigungu)))continue;
  if(!best||n.length>best.n.length)best={n,c};
 }
 return best?.c??null;
}

const HOME=/아파트단지|주거용공동주택/;
// A vworld place hit that is this apartment: an apartment-complex boundary or apartment building in the same
// 시도, on the same lot (lot search) or with the same name (name search).
export function pickPlace(items,{sido,lot,name}){
 const parcel=i=>String(i.address?.parcel??'');
 const ok=items.filter(i=>i.point&&parcel(i).startsWith(sido.slice(0,2))&&(HOME.test(i.category??'')||(name&&bare(String(i.title).split('/')[0])===bare(name))));
 const hit=lot
  ?ok.find(i=>new RegExp(`${lot.umd} ${lot.main}(?:-\\d+)?(?:\\s?[가-힣])?$`).test(parcel(i))&&HOME.test(i.category??''))
  :ok.find(i=>{const t=bare(String(i.title).split('/')[0]),n=bare(name);return n.length>=4&&(t===n||t.includes(n)||(n.includes(t)&&t.length>=5));});
 return hit?{lat:Number(hit.point.y),lng:Number(hit.point.x)}:null;
}
