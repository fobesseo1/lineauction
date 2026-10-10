import "server-only";
import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { mapAddress, matchCoordinates, type GeoAddress } from "./address";
import positions from "@/public/maps/positions.json";
type Position={latitude:number;longitude:number};
const pending=new Map<string,Promise<Position|null>>();
export async function locateAddress(p:{address:string|null;latitude:number|null;longitude:number|null}):Promise<Position|null>{
 if(p.latitude!==null&&p.longitude!==null)return {latitude:p.latitude,longitude:p.longitude};
 if(!p.address)return null;
 // Precomputed parcel coordinates work without the server-only Naver secret (public deployment).
 const known=(positions as Record<string,Position>)[mapAddress(p.address.split(" / ")[0])];
 if(known)return known;
 const query=mapAddress(p.address),key=process.env.NAVER_MAP_CLIENT_SECRET,id=process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
 if(!key||!id)return null;
 if(pending.has(query))return pending.get(query)!;
 const work=(async()=>{
  const folder="data/maps",path=`${folder}/${createHash('sha256').update(query).digest('hex')}.json`;
  try{const saved=JSON.parse(await readFile(path,'utf8'));if(saved.query===query&&Date.now()-saved.at<30*86400000&&Number.isFinite(saved.position?.latitude)&&Number.isFinite(saved.position?.longitude))return saved.position as Position;}catch{}
  try{
   const url=new URL("https://maps.apigw.ntruss.com/map-geocode/v2/geocode");url.searchParams.set("query",query);
   const response=await fetch(url,{headers:{"x-ncp-apigw-api-key-id":id!,"x-ncp-apigw-api-key":key!},signal:AbortSignal.timeout(5000)});
   if(!response.ok)return null;
   const data=await response.json();
   const addresses:Array<GeoAddress>=Array.isArray(data.addresses)?data.addresses.filter((a:GeoAddress)=>typeof a.roadAddress==='string'&&typeof a.jibunAddress==='string'&&typeof a.x==='string'&&typeof a.y==='string'):[];
   const position=matchCoordinates(query,addresses);
   if(position)try{await mkdir(folder,{recursive:true});const temporary=`${path}.${process.pid}.tmp`;await writeFile(temporary,JSON.stringify({query,position,at:Date.now()}));await rename(temporary,path);}catch{}
   return position;
  }catch{return null;}
 })();pending.set(query,work);
 try{return await work;}finally{pending.delete(query);}
}
