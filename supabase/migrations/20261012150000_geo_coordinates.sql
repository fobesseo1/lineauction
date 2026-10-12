-- Map points from vworld parcels (scripts/geo/coords.mjs, 출처: 국토교통부 브이월드).
alter table public.market_places add column latitude double precision, add column longitude double precision;

-- Bulk writer for coordinates (and derived PNUs), one call per batch instead of one per row.
create or replace function public.apply_geo(p_table text, p_rows jsonb) returns integer
language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
  if p_table = 'market_places' then
    update public.market_places m set pnu = coalesce(r.pnu, m.pnu), latitude = r.lat, longitude = r.lng
    from jsonb_to_recordset(p_rows) r(id text, pnu text, lat double precision, lng double precision) where m.id = r.id;
  elsif p_table = 'complexes' then
    update public.complexes c set latitude = r.lat, longitude = r.lng
    from jsonb_to_recordset(p_rows) r(id bigint, lat double precision, lng double precision) where c.id = r.id;
  elsif p_table = 'properties' then
    update public.properties p set pnu = coalesce(r.pnu, p.pnu), latitude = coalesce(r.lat, p.latitude), longitude = coalesce(r.lng, p.longitude)
    from jsonb_to_recordset(p_rows) r(id uuid, pnu text, lat double precision, lng double precision) where p.id = r.id;
  else raise exception 'unknown table %', p_table;
  end if;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.apply_geo(text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_geo(text, jsonb) to service_role;

-- Collectors do not know coordinates or (for court) the PNU, so an empty incoming value keeps the
-- stored one. Same function as 20261012100000_property_risk_flags.sql plus those three coalesces.
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
      risk_flags=incoming.risk_flags,source_updated_at=incoming.source_updated_at,last_seen_at=incoming.last_seen_at,updated_at=incoming.updated_at
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
