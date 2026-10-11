-- lineestate section per property: apartment (아파트·오피스텔·빌라) or commercial (상가·건물·토지·단독).
-- Collectors compute it with scripts/property-section.mjs; existing rows are backfilled below,
-- except the mixed court category, which scripts/backfill-property-section.mjs decides from the
-- court asset text in the local backup.
alter table public.properties add column section text check (section in ('apartment','commercial'));
create index properties_section_idx on public.properties (section);

update public.properties set section = case when usage_type in
  ('아파트','오피스텔','다세대','다세대주택','연립주택','연립주택,다세대,빌라','빌라','도시형생활주택','주상복합')
  then 'apartment' else 'commercial' end
where not (source = 'court' and usage_type = '상가,오피스텔,근린시설');

-- Same function as the initial schema, plus section in the update list. A writer that does not
-- send section keeps the stored value instead of clearing it.
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
    previous_data := to_jsonb(previous) - array['id','first_seen_at','last_seen_at','created_at','updated_at'];
    if previous_data = (to_jsonb(incoming) - array['id','first_seen_at','last_seen_at','created_at','updated_at']) then
      update public.properties set last_seen_at=greatest(last_seen_at,p_checked_at) where id=previous.id;
      return 'unchanged';
    end if;
    outcome := 'updated';
    -- Restore immutable identity and timestamps, then replace this locked row.
    incoming.id := previous.id; incoming.first_seen_at := previous.first_seen_at; incoming.created_at := previous.created_at;
    incoming.updated_at := now(); incoming.last_seen_at := p_checked_at;
    update public.properties set
      notice_id=incoming.notice_id,title=incoming.title,property_type=incoming.property_type,usage_type=incoming.usage_type,asset_type=incoming.asset_type,
      address=incoming.address,sido=incoming.sido,sigungu=incoming.sigungu,dong=incoming.dong,latitude=incoming.latitude,longitude=incoming.longitude,
      appraisal_price=incoming.appraisal_price,minimum_bid_price=incoming.minimum_bid_price,failed_bid_count=incoming.failed_bid_count,
      auction_round=incoming.auction_round,auction_sequence=incoming.auction_sequence,bid_start_at=incoming.bid_start_at,bid_end_at=incoming.bid_end_at,
      status=incoming.status,status_code=incoming.status_code,disposal_method=incoming.disposal_method,disposal_code=incoming.disposal_code,bulk_bid=incoming.bulk_bid,
      land_area=incoming.land_area,building_area=incoming.building_area,exclusive_area=incoming.exclusive_area,pnu=incoming.pnu,section=incoming.section,
      source_updated_at=incoming.source_updated_at,last_seen_at=incoming.last_seen_at,updated_at=incoming.updated_at
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
