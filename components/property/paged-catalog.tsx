"use client";
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PropertyCard } from "./property-card";
import { defaultFilters, type CatalogFilters, type CatalogPage } from "@/types/catalog";

export async function fetchCatalogPage(filters:CatalogFilters,signal:AbortSignal):Promise<CatalogPage> {
 const params=new URLSearchParams(Object.entries(filters).map(([key,value])=>[key,String(value)]));
 const response=await fetch(`/api/properties?${params}`,{signal});if(!response.ok)throw Error('목록을 불러오지 못했습니다.');return response.json();
}
export function PagedCatalog({initialPage=null,initialFilters=defaultFilters,explore=false,loadPage=fetchCatalogPage}:{initialPage?:CatalogPage|null;initialFilters?:CatalogFilters;explore?:boolean;loadPage?:(filters:CatalogFilters,signal:AbortSignal)=>Promise<CatalogPage>}) {
 const [filters,setFilters]=useState(initialFilters),[input,setInput]=useState(initialFilters.q),[page,setPage]=useState(initialPage),[busy,setBusy]=useState(!initialPage),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const initial=useRef(!!initialPage);const sequence=useRef(0);
 useEffect(()=>{
  if(initial.current){initial.current=false;return;}
  const controller=new AbortController(),request=++sequence.current;
  const timer=setTimeout(()=>{
   setBusy(true);setError('');
   loadPage(filters,controller.signal).then(next=>{if(request!==sequence.current||controller.signal.aborted)return;setPage(previous=>filters.offset?{...next,items:[...(previous?.items??[]),...next.items].filter((p,i,rows)=>rows.findIndex(r=>r.id===p.id)===i)}:next);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(request===sequence.current&&!controller.signal.aborted)setBusy(false);});
  },filters.offset?0:200);
  return()=>{controller.abort();clearTimeout(timer);};
 },[filters,loadPage,retry]);
 const change=(values:Partial<CatalogFilters>)=>{setPage(null);setFilters(previous=>({...previous,...values,offset:0}));};
 const total=page?.total;
 const selectClass="h-10 min-w-0 rounded-lg border bg-white px-3 text-sm";
 return <div className="space-y-6">
  <section className="space-y-3" aria-label="서울·경기 경매·공매 검색">
   {!explore&&<h1 className="text-lg font-semibold">서울·경기 경매·공매</h1>}
   <div className="flex flex-wrap gap-2">{(['court','onbid','all'] as const).map(source=><Button key={source} variant={filters.source===source?'default':'outline'} onClick={()=>change({source})}>{source==='court'?'법원 경매':source==='onbid'?'온비드 공매':'전체'}</Button>)}</div>
   <form className="flex items-center gap-3 rounded-full bg-white px-5 py-3 shadow-subtle" onSubmit={e=>{e.preventDefault();change({q:input.trim()});}}>
    <div className="min-w-0 flex-1"><label htmlFor="catalog-search" className="text-xs font-semibold">어떤 물건을 찾고 계신가요?</label><Input id="catalog-search" aria-label="지역·주소·사건번호·공매 관리번호 검색" placeholder="지역·주소·사건번호·공매 관리번호 검색" value={input} onChange={e=>setInput(e.target.value)} className="h-8 min-w-0 border-0 px-0 shadow-none focus-visible:ring-0"/></div>
    <Button type="submit" size="icon" aria-label="경매·공매 검색" className="size-12 shrink-0 rounded-full bg-rausch text-white hover:bg-rausch-600"><Search className="size-5"/></Button>
   </form>
   {explore&&<div className="grid gap-3 rounded-xl bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
    <select aria-label="진행 구분" className={selectClass} value={filters.lifecycle} onChange={e=>change({lifecycle:e.target.value as CatalogFilters['lifecycle']})}><option value="active">진행·재확인 대상</option><option value="closed">종료 확인 물건</option><option value="all">전체 이력 포함</option></select>
    <select aria-label="지역" className={selectClass} value={filters.region} onChange={e=>change({region:e.target.value})}><option value="seoul-gyeonggi">서울·경기</option><option value="서울특별시">서울특별시</option><option value="경기도">경기도</option><option value="all">모든 지역</option></select>
    <div><Input aria-label="물건종류" list="catalog-usages" placeholder="물건종류 (전체)" value={filters.usage==='all'?'':filters.usage} onChange={e=>change({usage:e.target.value||'all'})}/><datalist id="catalog-usages">{['아파트','다세대주택','연립주택','오피스텔','대지','근린생활시설','주택부지','기타토지'].map(v=><option key={v} value={v}/>)}</datalist></div>
    <select aria-label="정렬" className={selectClass} value={filters.sort} onChange={e=>change({sort:e.target.value as CatalogFilters['sort']})}><option value="recent">최근 등록순</option><option value="price">최저가격순</option><option value="deadline">마감임박순</option></select>
    <Input aria-label="최대 입찰가격 원" placeholder="최대 입찰가격 (원)" inputMode="numeric" value={filters.maxBid} onChange={e=>change({maxBid:e.target.value.replace(/\D/g,'').slice(0,29)})}/>
    <Input aria-label="최소 유찰횟수" placeholder="최소 유찰횟수" inputMode="numeric" value={filters.minFailed} onChange={e=>change({minFailed:e.target.value.replace(/\D/g,'').slice(0,3)})}/>
   </div>}
  </section>
  <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{filters.q?'검색 결과':'최근 확인된 물건'}{total!==undefined?` ${total.toLocaleString('ko-KR')}건`:''}</h2><Button variant="ghost" onClick={()=>{setInput('');change({...defaultFilters,source:filters.source});}}>검색 초기화</Button></div>
  <p className="text-xs text-muted-foreground">공매는 입찰 회차별 조건 자료입니다. 목록은 24건씩 조회합니다.</p>
  {error&&<div role="alert" className="rounded-xl bg-white p-5">{error}<Button variant="outline" className="ml-3" onClick={()=>setRetry(n=>n+1)}>다시 시도</Button></div>}
  <div aria-busy={busy} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{page?.items.map(p=><PropertyCard key={p.id} property={p}/>)}{busy&&!page&&Array.from({length:4},(_,i)=><div key={i} className="h-80 animate-pulse rounded-xl bg-slate-100"/>)}</div>
  {!busy&&!error&&page&&!page.items.length&&<p role="status" className="py-12 text-center text-muted-foreground">검색 조건에 맞는 물건이 없습니다.</p>}
  {busy&&<p role="status" className="text-center text-sm text-muted-foreground">목록을 불러오는 중입니다…</p>}
  {page?.nextOffset!==null&&page?.nextOffset!==undefined&&<div className="text-center"><Button disabled={busy} variant="outline" onClick={()=>setFilters(previous=>({...previous,offset:page.nextOffset!}))}>물건 더 보기 ({page.items.length.toLocaleString()} / {page.total.toLocaleString()})</Button></div>}
 </div>;
}
