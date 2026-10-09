export function mapAddress(address: string) {
  const clean = address.replace(/^소재지\s*[:：]\s*/, "").trim().replace(/\s+/g, " ");
  // Stop at the parcel/building number; retain 산 and hyphenated parcel numbers.
  return clean.match(/^(.+?(?:동|리|가|로|길)\s+(?:산\s*)?\d+(?:-\d+)?)(?=\s|,|\(|$)/)?.[1] ?? clean;
}
export type GeoAddress = {roadAddress:string;jibunAddress:string;x:string;y:string};
export function matchCoordinates(query:string, addresses:GeoAddress[]) {
  const normalize=(s:string)=>s.trim().replace(/\s+/g," ").replace(/^서울시 /,"서울특별시 ");
  const expected=normalize(query);
  const matches=addresses.filter(a=>[a.roadAddress,a.jibunAddress].some(s=>normalize(mapAddress(s))===expected));
  const positions=matches.map(a=>({latitude:Number(a.y),longitude:Number(a.x)})).filter(p=>Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&p.latitude>=33&&p.latitude<=39&&p.longitude>=124&&p.longitude<=132);
  if(!positions.length || positions.some(p=>Math.abs(p.latitude-positions[0].latitude)>0.0001||Math.abs(p.longitude-positions[0].longitude)>0.0001))return null;
  return positions[0];
}
