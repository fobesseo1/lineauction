"use client";
import {useState} from "react";
import {Search} from "lucide-react";
import {Input} from "@/components/ui/input";
import {Button} from "@/components/ui/button";
import {PropertyCard} from "./property-card";
import type {PropertyListing} from "@/types/listing";
export function DashboardSearch({properties}:{properties:PropertyListing[]}){
 const [input,setInput]=useState(""),[query,setQuery]=useState(""),[visible,setVisible]=useState(24);
 const term=query.trim().toLocaleLowerCase();
 const results=properties.filter(p=>term?[p.title,p.address,p.source_property_id,p.sido,p.sigungu,p.dong,p.usage_type].join(" ").toLocaleLowerCase().includes(term):p.lifecycle_state!=="closed");
 return <div className="space-y-6">
  <section className="space-y-3" aria-label="서울·경기 경매물건 검색">
   <h1 className="text-xs font-normal text-muted-foreground">서울·경기 경매물건 총 <span className="font-semibold text-foreground">{properties.length.toLocaleString("ko-KR")}</span>건</h1>
   <form className="flex w-full items-center gap-3 rounded-full bg-white px-5 py-3 shadow-subtle" onSubmit={e=>{e.preventDefault();setQuery(input);setVisible(24);}}>
    <div className="min-w-0 flex-1"><label htmlFor="dashboard-property-search" className="text-xs font-semibold">어떤 경매물건을 찾고 계신가요?</label><Input id="dashboard-property-search" aria-label="지역·주소·사건번호 검색" placeholder="지역·주소·사건번호를 검색하세요" value={input} onChange={e=>setInput(e.target.value)} className="h-8 min-w-0 border-0 px-0 shadow-none focus-visible:ring-0"/></div>
    <Button type="submit" size="icon" aria-label="경매물건 검색" className="size-12 shrink-0 rounded-full bg-rausch text-white hover:bg-rausch-600"><Search className="size-5"/></Button>
   </form>
  </section>
  <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">{term?`검색 결과 ${results.length.toLocaleString("ko-KR")}건`:"최근 확인된 물건"}</h2>{term&&<Button variant="ghost" onClick={()=>{setInput("");setQuery("");setVisible(24);}}>검색 초기화</Button>}</div>
  {results.length?<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{results.slice(0,visible).map(p=><PropertyCard key={p.id} property={p}/>)}</div>:<p role="status" className="py-12 text-center text-muted-foreground">검색 조건에 맞는 물건이 없습니다.</p>}
  {results.length>visible&&<div className="text-center"><Button variant="outline" onClick={()=>setVisible(n=>n+24)}>물건 더 보기</Button></div>}
 </div>;
}
