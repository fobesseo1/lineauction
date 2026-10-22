-- Keep a stored 매각 result when an update arrives without one. On 2026-10-21 a court state rebuilt
-- from run inputs (no result evidence) wiped the results of 10-08..10-13 through this function.
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
    incoming.build_year := coalesce(incoming.build_year, previous.build_year);
    -- A run without result evidence (e.g. a court state rebuilt without results) must not erase a
    -- result already stored; a later result replaces it.
    if incoming.last_result is null then
      incoming.last_result := previous.last_result; incoming.last_result_date := previous.last_result_date;
    end if;
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
      risk_flags=incoming.risk_flags,sale_date=incoming.sale_date,build_year=incoming.build_year,last_result=incoming.last_result,last_result_date=incoming.last_result_date,source_updated_at=incoming.source_updated_at,last_seen_at=incoming.last_seen_at,updated_at=incoming.updated_at
    where id=previous.id;
  else
    outcome := 'created'; incoming.id := gen_random_uuid(); incoming.created_at := now(); incoming.updated_at := now();
    incoming.first_seen_at := p_checked_at; incoming.last_seen_at := p_checked_at;
    insert into public.properties select incoming.*;
  end if;
  return outcome;
end $$;
