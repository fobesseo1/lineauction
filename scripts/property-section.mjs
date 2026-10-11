// Which lineestate section a court/Onbid property belongs to.
//   apartment  = 아파트, 오피스텔, 빌라(연립·다세대), 도시형생활주택, 주상복합
//   commercial = 상가, 건물, 토지, 단독·다가구 and everything else
// The court category "상가,오피스텔,근린시설" mixes both, so the asset/detail text decides it:
// an officetel mention means apartment, otherwise commercial.
const APARTMENT_USES=new Set(['아파트','오피스텔','다세대','다세대주택','연립주택','연립주택,다세대,빌라','빌라','도시형생활주택','주상복합']);
const MIXED_USES=new Set(['상가,오피스텔,근린시설']);
export function sectionOf(usage,text=''){
 const use=String(usage??'').trim();
 if(APARTMENT_USES.has(use))return 'apartment';
 if(MIXED_USES.has(use))return /오피스텔/.test(text)?'apartment':'commercial';
 return 'commercial';
}
// The text a court item carries that can name the building use.
export const courtSectionText=item=>JSON.stringify([item?.detail??null,item?.assets??null]);
