"use client";
import Script from 'next/script';
import {useEffect,useRef,useState} from 'react';
import {mapAddress} from '@/lib/maps/address';
type Position={latitude:number;longitude:number};
type SDK={LatLng:new(lat:number,lng:number)=>object;Map:new(node:HTMLElement,options:object)=>{destroy():void};Marker:new(options:object)=>{setMap(value:null):void};Service:{Status:{OK:unknown};geocode(options:{query:string},callback:(status:unknown,response:{v2?:{addresses?:{x:string;y:string}[]}})=>void):void}};
const locations=new Map<string,Promise<Position|null>>();
export function CoverLocationMap({address,approximate}:{address:string;approximate:boolean}){
 const clientId=process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID?.trim();
 const node=useRef<HTMLDivElement>(null),[ready,setReady]=useState(false),[error,setError]=useState(false);
 useEffect(()=>{
  const sdk=(window as Window&{naver?:{maps:SDK}}).naver?.maps;
  if(!ready||!sdk?.Service||!node.current)return;
  const query=mapAddress(address);let active=true,map:InstanceType<SDK['Map']>|undefined,marker:InstanceType<SDK['Marker']>|undefined;
  if(!locations.has(query))locations.set(query,new Promise(resolve=>{
   const timeout=setTimeout(()=>resolve(null),8000);
   sdk.Service.geocode({query},(status,response)=>{clearTimeout(timeout);const row=response.v2?.addresses?.[0];const latitude=Number(row?.y),longitude=Number(row?.x);resolve(status===sdk.Service.Status.OK&&row&&latitude>=33&&latitude<=39&&longitude>=124&&longitude<=132?{latitude,longitude}:null);});
  }));
  locations.get(query)!.then(position=>{
   if(!active)return;
   if(!position){setError(true);return;}
   const center=new sdk.LatLng(position.latitude,position.longitude);
   map=new sdk.Map(node.current!,{center,zoom:approximate?13:16,draggable:false,scrollWheel:false,keyboardShortcuts:false,disableDoubleClickZoom:true});
   if(!approximate)marker=new sdk.Marker({position:center,map});
  });
  return()=>{active=false;marker?.setMap(null);map?.destroy();};
 },[ready,address,approximate]);
 return <div className="absolute inset-0 bg-slate-100">
  <div ref={node} className="pointer-events-none h-full w-full" aria-label={`${address} 네이버지도`}/>
  {(!ready||error||!clientId)&&<div className="absolute inset-0 grid place-content-center gap-2 p-5 text-center"><span className="text-lg font-semibold">네이버지도</span><span className="text-sm">{address}</span><span className="text-xs text-muted-foreground">{error||!clientId?'지도를 열어 위치 확인':'위치 지도를 불러오는 중…'}</span></div>}
  <span className="absolute bottom-3 left-3 rounded-full bg-white/95 px-3 py-1 text-xs">{approximate?'주소 미제공 · 지역 지도':'사진 대신 위치 지도'} · 네이버지도 열기</span>
  {clientId&&<Script id="naver-maps-sdk" src={`https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}&submodules=geocoder`} strategy="afterInteractive" onReady={()=>setReady(true)} onError={()=>setError(true)}/>}
 </div>;
}
