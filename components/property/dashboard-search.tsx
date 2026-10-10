"use client";
import {useState} from "react";
import Link from 'next/link';
import {Search} from "lucide-react";
import {Input} from "@/components/ui/input";
import {Button} from "@/components/ui/button";
import {PropertyCard} from "./property-card";
import type {PropertyListing} from "@/types/listing";
export function DashboardSearch({properties,initialSource}:{properties:PropertyListing[];initialSource?:string}){
 const source=initialSource==='onbid'||initialSource==='all'?initialSource:'court';
 const [input,setInput]=useState(""),[query,setQuery]=useState(""),[visible,setVisible]=useState(24);
 const term=query.trim().toLocaleLowerCase();
 const selected=properties.filter(p=>source==='all'||p.source===source);
 const results=selected.filter(p=>term?[p.title,p.address,p.source_property_id,p.sido,p.sigungu,p.dong,p.usage_type].join(" ").toLocaleLowerCase().includes(term):p.lifecycle_state!=="closed");
 return <div className="space-y-6">
  <section className="space-y-3" aria-label="서울·경기 경매·공매 검색">
   <h1 className="text-lg font-semibold">서울·경기 경매·공매</h1>
   <div className="flex flex-wrap gap-2" aria-label="경매·공매 구분">{[['court','법원 경매'],['onbid','온비드 공매'],['all','전체']].map(([value,label])=><Button asChild key={value} variant={source===value?'default':'outline'}><Link prefetch={false} href={`/dashboard?demo=0&source=${value}`}>{label}</Link></Button>)}</div>
   <p className="text-xs text-muted-foreground">{source==='court'?'법원 경매':source==='onbid'?'온비드 공매':'경매·공매 전체'} · 물건 {new Set(selected.map(p=>`${p.source}:${p.source_property_id}`)).size.toLocaleString('ko-KR')}개 · {selected.length.toLocaleString('ko-KR')}건{source!=='court'?' (공매는 입찰 회차별 자료 포함)':''}</p>
   <form className="flex w-full items-center gap-3 rounded-full bg-white px-5 py-3 shadow-subtle" onSubmit={e=>{e.preventDefault();setQuery(input);setVisible(24);}}>
    <div className="min-w-0 flex-1"><label htmlFor="dashboard-property-search" className="text-xs font-semibold">어떤 물건을 찾고 계신가요?</label><Input id="dashboard-property-search" aria-label="지역·주소·사건번호·공매 관리번호 검색" placeholder="지역·주소·사건번호·공매 관리번호 검색" value={input} onChange={e=>setInput(e.target.value)} className="h-8 min-w-0 border-0 px-0 shadow-none focus-visible:ring-0"/></div>
    <Button type="submit" size="icon" aria-label="경매·공매 검색" className="size-12 shrink-0 rounded-full bg-rausch text-white hover:bg-rausch-600"><Search className="size-5"/></Button>
   </form>
  </section>
  <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">{term?`검색 결과 ${results.length.toLocaleString("ko-KR")}건`:"최근 확인된 물건"}</h2>{term&&<Button variant="ghost" onClick={()=>{setInput("");setQuery("");setVisible(24);}}>검색 초기화</Button>}</div>
  {results.length?<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{results.slice(0,visible).map(p=><PropertyCard key={p.id} property={p}/>)}</div>:<p role="status" className="py-12 text-center text-muted-foreground">검색 조건에 맞는 물건이 없습니다.</p>}
  {results.length>visible&&<div className="text-center"><Button variant="outline" onClick={()=>setVisible(n=>n+24)}>물건 더 보기</Button></div>}
 </div>;
}
