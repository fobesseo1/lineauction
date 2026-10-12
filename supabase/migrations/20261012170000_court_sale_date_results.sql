-- 1. 매각기일 for court properties (the court item's auctionDate). Onbid keeps bid_start_at/bid_end_at.
alter table public.properties add column sale_date date;
update public.properties p set sale_date = (c.target->>'auctionDate')::date
from public.property_comparisons c
where c.property_id = p.id and p.source = 'court' and c.target->>'auctionDate' ~ '^\d{4}-\d{2}-\d{2}$';

-- 2. A court 물건 confirmed sold (property_lifecycle closed) is no longer current.
create or replace function public.refresh_current_rounds() returns integer
language sql security invoker set search_path = '' as $$
  with cur as (
    select distinct on (source_property_id) id
    from public.properties
    where source = 'onbid' and bid_end_at >= now()
    order by source_property_id, bid_end_at, auction_condition_id
  ), closed as (
    select property_id from public.property_lifecycle where state = 'closed'
  ), next_state as (
    select p.id, case when p.source = 'court' then p.id not in (select property_id from closed)
                      else p.id in (select id from cur) end as current
    from public.properties p
  ), changed as (
    update public.properties p set is_current = n.current
    from next_state n where n.id = p.id and p.is_current is distinct from n.current
    returning 1
  )
  select count(*)::integer from changed;
$$;
revoke all on function public.refresh_current_rounds() from public, anon, authenticated;
grant execute on function public.refresh_current_rounds() to service_role;
select public.refresh_current_rounds();

-- 3. 낙찰 결과 (court sales confirmed on the court result list), for 인근 매각 사례 and 낙찰가율.
create or replace view public.auction_results with (security_invoker = true) as
select l.property_id,
       p.sido, p.sigungu, p.dong, p.address, p.section, p.usage_type,
       coalesce(p.exclusive_area, p.building_area) as area,
       p.latitude, p.longitude,
       (l.evidence->>'auctionDate')::date as sale_date,
       nullif(regexp_replace(split_part(l.evidence->'resultRow'->>2, '매각', 2), '[^0-9]', '', 'g'), '')::bigint as sale_price,
       nullif(regexp_replace(l.evidence->'identityRow'->>5, '[^0-9]', '', 'g'), '')::bigint as appraisal_price,
       nullif(regexp_replace(l.evidence->'resultRow'->>1, '[^0-9]', '', 'g'), '')::bigint as minimum_bid_price,
       p.failed_bid_count,
       a.place_id, a.area_type, a.market_price
from public.property_lifecycle l
join public.properties p on p.id = l.property_id
left join public.property_analysis a on a.property_id = l.property_id
where l.state = 'closed' and l.evidence->>'result' = '매각' and l.evidence ? 'resultRow';
grant select on public.auction_results to anon, authenticated;

-- 4. Keep sale_date through the property upsert (same function as 20261012150000 plus sale_date).
create or replace function public.upsert_auction_property(p_input jsonb, p_checked_at timestamptz) returns text
language plpgsql security invoker set search_path = '' as $$
declare
  incoming public.properties;
  previous public.properties;
  outcome text;
  previous_data jsonb;
begin
  if p_checked_at is null then raise exception 'checked_at required'; end if;
  incoming := jsonb_populate_record(null::public.properties, p_input);
  if incoming.source is null or incoming.source_property_id is null or incoming.auction_condition_id is null then
    raise exception 'source identity required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(jsonb_build_array(incoming.source,incoming.source_property_id,incoming.auction_condition_id)::text,0));
  select * into previous from public.properties where source=incoming.source and source_property_id=incoming.source_property_id and auction_condition_id=incoming.auction_condition_id for update;
  if found then
    if previous.last_seen_at > p_checked_at or (previous.source_updated_at is not null and incoming.source_updated_at is not null and previous.source_updated_at > incoming.source_updated_at) then return 'stale'; end if;
    incoming.section := coalesce(incoming.section, previous.section);
    incoming.risk_flags := coalesce(incoming.risk_flags, previous.risk_flags);
    incoming.pnu := coalesce(incoming.pnu, previous.pnu);
    incoming.latitude := coalesce(incoming.latitude, previous.latitude);
    incoming.longitude := coalesce(incoming.longitude, previous.longitude);
    incoming.sale_date := coalesce(incoming.sale_date, previous.sale_date);
    incoming.is_current := previous.is_current;   -- owned by refresh_current_rounds()
    previous_data := to_jsonb(previous) - array['id','first_seen_at','last_seen_at','created_at','updated_at'];
    if previous_data = (to_jsonb(incoming) - array['id','first_seen_at','last_seen_at','created_at','updated_at']) then
      update public.properties set last_seen_at=greatest(last_seen_at,p_checked_at) where id=previous.id;
      return 'unchanged';
    end if;
    outcome := 'updated';
    incoming.id := previous.id; incoming.first_seen_at := previous.first_seen_at; incoming.created_at := previous.created_at;
    incoming.updated_at := now(); incoming.last_seen_at := p_checked_at;
    update public.properties set
      notice_id=incoming.notice_id,title=incoming.title,property_type=incoming.property_type,usage_type=incoming.usage_type,asset_type=incoming.asset_type,
      address=incoming.address,sido=incoming.sido,sigungu=incoming.sigungu,dong=incoming.dong,latitude=incoming.latitude,longitude=incoming.longitude,
      appraisal_price=incoming.appraisal_price,minimum_bid_price=incoming.minimum_bid_price,failed_bid_count=incoming.failed_bid_count,
      auction_round=incoming.auction_round,auction_sequence=incoming.auction_sequence,bid_start_at=incoming.bid_start_at,bid_end_at=incoming.bid_end_at,
      status=incoming.status,status_code=incoming.status_code,disposal_method=incoming.disposal_method,disposal_code=incoming.disposal_code,bulk_bid=incoming.bulk_bid,
      land_area=incoming.land_area,building_area=incoming.building_area,exclusive_area=incoming.exclusive_area,pnu=incoming.pnu,section=incoming.section,
      risk_flags=incoming.risk_flags,sale_date=incoming.sale_date,source_updated_at=incoming.source_updated_at,last_seen_at=incoming.last_seen_at,updated_at=incoming.updated_at
    where id=previous.id;
  else
    outcome := 'created'; incoming.id := gen_random_uuid(); incoming.created_at := now(); incoming.updated_at := now();
    incoming.first_seen_at := p_checked_at; incoming.last_seen_at := p_checked_at;
    insert into public.properties select incoming.*;
  end if;
  return outcome;
end $$;
revoke all on function public.upsert_auction_property(jsonb,timestamptz) from public, anon, authenticated;
grant execute on function public.upsert_auction_property(jsonb,timestamptz) to service_role;
