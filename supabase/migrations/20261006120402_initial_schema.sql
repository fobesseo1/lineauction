create table public.properties (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('onbid','court')),
  source_property_id text not null,
  auction_condition_id text not null,
  notice_id text, title text not null, property_type text not null,
  usage_type text, asset_type text, address text, sido text, sigungu text, dong text,
  latitude numeric(10,7), longitude numeric(10,7),
  appraisal_price numeric(30,0) check (appraisal_price >= 0),
  minimum_bid_price numeric(30,0) check (minimum_bid_price >= 0),
  failed_bid_count integer check (failed_bid_count >= 0), auction_round text, auction_sequence text,
  bid_start_at timestamptz, bid_end_at timestamptz, status text, status_code text,
  disposal_method text, disposal_code text, bulk_bid boolean,
  land_area numeric, building_area numeric, exclusive_area numeric, pnu text, source_updated_at timestamptz,
  first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (source, source_property_id, auction_condition_id)
);
create index properties_region_idx on public.properties(sido,sigungu,dong);
create index properties_deadline_idx on public.properties(bid_end_at);
create index properties_seen_idx on public.properties(last_seen_at desc);

create table public.property_price_history (
  id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id) on delete cascade,
  minimum_bid_price numeric(30,0), appraisal_price numeric(30,0), failed_bid_count integer,
  status text, status_code text, bid_start_at timestamptz, bid_end_at timestamptz, auction_round text, auction_sequence text,
  checked_at timestamptz not null
);
create index history_property_idx on public.property_price_history(property_id,checked_at desc);

create table public.transactions (
  id uuid primary key default gen_random_uuid(), property_id uuid references public.properties(id) on delete set null,
  source text not null, source_transaction_id text not null, property_type text not null,
  complex_name text, transaction_date date not null, price numeric(30,0) not null check (price >= 0),
  area numeric not null check (area >= 0), floor integer, address text, sido text, sigungu text, dong text,
  region_code text, cancelled_at timestamptz, created_at timestamptz not null default now(),
  unique(source,source_transaction_id)
);
create index transactions_match_idx on public.transactions(region_code,dong,complex_name,transaction_date desc);
create index transactions_property_idx on public.transactions(property_id);

create table public.property_analysis (
  id uuid primary key default gen_random_uuid(), property_id uuid not null unique references public.properties(id) on delete cascade,
  market_price numeric(30,0), market_price_method text, appraisal_ratio numeric, market_ratio numeric,
  discount_rate numeric, estimated_price_gap numeric(30,0),
  transaction_count_3m integer, transaction_count_6m integer, transaction_count_12m integer,
  deal_score numeric check (deal_score between 0 and 100), deal_grade text check (deal_grade in ('S','A','B','C','D')),
  score_breakdown jsonb, calculated_at timestamptz not null default now()
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  recipient_key text not null, notification_type text not null, payload_hash text not null,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  sent_at timestamptz, created_at timestamptz not null default now(),
  unique(recipient_key,property_id,notification_type,payload_hash)
);
create table public.user_filters (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, regions text[] not null default '{}', property_types text[] not null default '{}',
  max_bid_price numeric(30,0), max_appraisal_ratio numeric, max_market_ratio numeric,
  min_failed_bid_count integer, min_area numeric, min_deal_score numeric,
  bid_deadline_min_days integer, bid_deadline_max_days integer, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index notifications_property_idx on public.notifications(property_id);
create index notifications_user_idx on public.notifications(user_id);
create index filters_user_idx on public.user_filters(user_id);
create table public.app_settings (
  id integer primary key check (id = 1), scoring_config jsonb not null, collection_config jsonb not null,
  updated_at timestamptz not null default now()
);

create function public.capture_property_history() returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'INSERT' or
    row(new.minimum_bid_price,new.appraisal_price,new.failed_bid_count,new.status,new.status_code,new.bid_start_at,new.bid_end_at,new.auction_round,new.auction_sequence)
    is distinct from
    row(old.minimum_bid_price,old.appraisal_price,old.failed_bid_count,old.status,old.status_code,old.bid_start_at,old.bid_end_at,old.auction_round,old.auction_sequence)
  then
    insert into public.property_price_history(property_id,minimum_bid_price,appraisal_price,failed_bid_count,status,status_code,bid_start_at,bid_end_at,auction_round,auction_sequence,checked_at)
    values(new.id,new.minimum_bid_price,new.appraisal_price,new.failed_bid_count,new.status,new.status_code,new.bid_start_at,new.bid_end_at,new.auction_round,new.auction_sequence,new.last_seen_at);
  end if;
  return new;
end $$;
create trigger property_history after insert or update on public.properties for each row execute function public.capture_property_history();

-- One atomic RPC per property. Lock also serializes concurrent first-time inserts.
create function public.upsert_auction_property(p_input jsonb, p_checked_at timestamptz) returns text
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
      land_area=incoming.land_area,building_area=incoming.building_area,exclusive_area=incoming.exclusive_area,pnu=incoming.pnu,
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

-- Text money at the PostgREST boundary prevents JSON-number rounding.
create view public.properties_public with (security_invoker=true) as
select id,source,source_property_id,auction_condition_id,notice_id,title,property_type,usage_type,asset_type,address,sido,sigungu,dong,
  latitude::float8,longitude::float8,appraisal_price::text,minimum_bid_price::text,failed_bid_count,auction_round,auction_sequence,
  bid_start_at,bid_end_at,status,status_code,disposal_method,disposal_code,bulk_bid,land_area::float8,building_area::float8,exclusive_area::float8,pnu,
  source_updated_at,first_seen_at,last_seen_at,created_at,updated_at
from public.properties;
create view public.property_history_public with (security_invoker=true) as
select id,property_id,minimum_bid_price::text,appraisal_price::text,failed_bid_count,status,status_code,bid_start_at,bid_end_at,checked_at
from public.property_price_history;

alter table public.properties enable row level security;
alter table public.property_price_history enable row level security;
alter table public.transactions enable row level security;
alter table public.property_analysis enable row level security;
alter table public.notifications enable row level security;
alter table public.user_filters enable row level security;
alter table public.app_settings enable row level security;
create policy properties_read on public.properties for select to anon,authenticated using (true);
create policy history_read on public.property_price_history for select to anon,authenticated using (true);
create policy transactions_read on public.transactions for select to anon,authenticated using (true);
create policy analysis_read on public.property_analysis for select to anon,authenticated using (true);
create policy filters_owner on public.user_filters for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy notification_owner on public.notifications for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.properties,public.property_price_history,public.transactions,public.property_analysis,public.app_settings,public.notifications,public.user_filters from anon,authenticated;
grant select on public.properties,public.property_price_history,public.transactions,public.property_analysis,public.properties_public,public.property_history_public to anon,authenticated;
grant select,insert,update,delete on public.user_filters to authenticated;
grant select on public.notifications to authenticated;
grant all on all tables in schema public to service_role;
