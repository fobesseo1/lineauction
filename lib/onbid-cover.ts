/** Only API-provided official image URLs may be displayed publicly. */
export function officialOnbidCover(value: unknown): string | null {
 if(typeof value!=='string')return null;
 try {
  const url=new URL(value);
  return url.protocol==='https:'&&['www.onbid.co.kr','onbid.co.kr','open.kamco.or.kr'].includes(url.hostname)&&!url.username&&!url.password?url.href:null;
 }catch{return null;}
}
