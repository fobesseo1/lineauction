import type { SupabaseClient } from "@supabase/supabase-js";
import { cardSchema, type CatalogFilters, type CatalogPage } from "@/types/catalog";
import { inPublicScope } from "@/sharing/scope";
export const CARD_COLUMNS = "id,source,source_property_id,auction_condition_id,title,usage_type,address,sido,sigungu,dong,minimum_bid_price::text,appraisal_price::text,failed_bid_count,exclusive_area,bid_end_at,first_seen_at,lifecycle:property_lifecycle(state,reason),closed:property_lifecycle(state)";
export async function queryCatalog(db:SupabaseClient, f:CatalogFilters, signal?:AbortSignal, countMode:'exact'|'planned'|'estimated'='exact'):Promise<CatalogPage> {
 let query=db.from('properties').select(CARD_COLUMNS,{count:countMode});
 if(f.source!=='all')query=query.eq('source',f.source);
 if(f.region!=='all') {
  // 'capital' (수도권) = Seoul, Gyeonggi, Incheon; 'seoul-gyeonggi' is kept as an alias for old links.
  query=f.region==='capital'||f.region==='seoul-gyeonggi'?query.in('sido',['서울특별시','경기도','인천광역시']):query.eq('sido',f.region);
  // Source is already fixed: avoid redundant OR branches on court-only pages.
  if(f.source!=='onbid') {
   query=f.source==='court'?query.or('address.like.서울특별시 *,address.like.경기도 *,address.like.인천광역시 *'):query.or('source.eq.onbid,and(source.eq.court,or(address.like.서울특별시 *,address.like.경기도 *,address.like.인천광역시 *))');
   for(const prefix of ['소재지 :','부산','대구','광주','대전','울산','세종','강원','충청','전라','경상','제주','충북','충남','전북','전남','경북','경남'])query=f.source==='court'?query.not('address','like',`% / ${prefix}%`):query.or(`source.eq.onbid,address.not.like.% / ${prefix}%`);
  }
 }
 if(f.lifecycle==='closed')query=query.eq('closed.state','closed').not('closed','is',null);
 if(f.lifecycle==='active')query=query.eq('closed.state','closed').is('closed',null);
 if(f.usage!=='all')query=query.eq('usage_type',f.usage);
 if(f.maxBid)query=query.lte('minimum_bid_price',f.maxBid);
 if(f.minFailed)query=query.gte('failed_bid_count',Number(f.minFailed));
 if(f.q){const term=f.q.replace(/[\\%_*(),."']/g,' ').trim();if(term)query=query.or(['title','address','sido','sigungu','dong','source_property_id'].map(k=>`${k}.ilike.%${term}%`).join(','));}
 query=query.order(f.sort==='price'?'minimum_bid_price':f.sort==='deadline'?'bid_end_at':'first_seen_at',{ascending:f.sort!=='recent',nullsFirst:false}).order('id').range(f.offset,f.offset+23);
 if(signal)query=query.abortSignal(signal);
 const {data,error,count}=await query;
 if(error)throw new Error('물건 목록을 불러오지 못했습니다. 다시 시도해 주세요.',{cause:{code:error.code,message:error.message}});
 // Fetch covers only after pagination. A lateral photo join before ORDER/LIMIT
 // can scan media for every matching property and exhaust the anonymous timeout.
 const rows=data??[];
 const covers=new Map<string,string>();
 if(rows.length){
  let mediaQuery=db.from('property_media').select('property_id,path').in('property_id',rows.map(row=>row.id)).order('sort_order').order('id');
  if(signal)mediaQuery=mediaQuery.abortSignal(signal);
  const media=await mediaQuery;
  if(media.error)throw new Error('사진 목록을 불러오지 못했습니다. 다시 시도해 주세요.',{cause:{code:media.error.code,message:media.error.message}});
  for(const photo of media.data??[])if(!covers.has(photo.property_id))covers.set(photo.property_id,photo.path);
 }
 const items=rows.map(row=>{const r=row as unknown as Record<string,unknown>;const life=r.lifecycle as {state?:string;reason?:string}|null;return cardSchema.parse({...r,lifecycle_state:life?.state??null,lifecycle_reason:life?.reason??null,cover_image:covers.get(row.id)??null});}).filter(p=>f.region==='all'||p.source==='onbid'||inPublicScope(p.address));
 const total=count??0;return {items,total,nextOffset:f.offset+24<total?f.offset+24:null};
}
