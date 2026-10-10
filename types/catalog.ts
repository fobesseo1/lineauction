import { z } from "zod";
import { propertySchema } from "./property";
export const cardSchema = propertySchema.pick({ id:true, source:true, source_property_id:true, auction_condition_id:true, title:true, usage_type:true, address:true, sido:true, sigungu:true, dong:true, minimum_bid_price:true, appraisal_price:true, failed_bid_count:true, exclusive_area:true, bid_end_at:true, first_seen_at:true, lifecycle_state:true, lifecycle_reason:true, cover_image:true });
export type CardProperty = z.infer<typeof cardSchema> & { demo?: import("./listing").PropertyListing["demo"] };
export type CatalogFilters = { source:"court"|"onbid"|"all"; q:string; region:string; usage:string; lifecycle:"active"|"closed"|"all"; sort:"recent"|"price"|"deadline"; maxBid:string; minFailed:string; offset:number };
export type CatalogPage = { items:CardProperty[]; total:number; nextOffset:number|null };
export const defaultFilters:CatalogFilters = {source:"court",q:"",region:"seoul-gyeonggi",usage:"all",lifecycle:"active",sort:"recent",maxBid:"",minFailed:"",offset:0};
export function parseCatalogFilters(params:URLSearchParams):CatalogFilters {
 const source=params.get("source"), lifecycle=params.get("lifecycle"), sort=params.get("sort");
 return {...defaultFilters,source:source==='all'||source==='onbid'?source:'court',q:(params.get('q')??'').trim().slice(0,120),region:(params.get('region')??defaultFilters.region).slice(0,30),usage:(params.get('usage')??'all').slice(0,60),lifecycle:lifecycle==='closed'||lifecycle==='all'?lifecycle:'active',sort:sort==='price'||sort==='deadline'?sort:'recent',maxBid:/^\d{1,29}$/.test(params.get('maxBid')??'')?params.get('maxBid')!:'',minFailed:/^\d{1,3}$/.test(params.get('minFailed')??'')?params.get('minFailed')!:'',offset:Math.min(1000000,Math.max(0,Number.parseInt(params.get('offset')??'0')||0))};
}
