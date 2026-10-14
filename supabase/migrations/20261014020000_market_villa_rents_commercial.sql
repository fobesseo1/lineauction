-- More trade data now that the project is on Supabase Pro (scripts/molit/publish.mjs):
--   market_places: 빌라 buildings join as kind 'rh' (screens must filter by kind).
--   market_trades: sales for 36 months instead of 12 (apt, offi, rh).
--   market_rents: 전월세 contracts for the last 12 months per building+평형.
--   market_commercial_trades: 토지·상업업무용·단독다가구 sales for 36 months. MOLIT masks most lot
--   numbers of these ("1**"), so rows carry the 법정동 and attributes, not a building link.
alter table public.market_places drop constraint market_places_kind_check;
alter table public.market_places add constraint market_places_kind_check check (kind in ('apt','offi','rh'));
create index market_trades_date_idx on public.market_trades (deal_date);

create table public.market_rents (
  id text primary key,
  place_id text not null references public.market_places(id) on delete cascade,
  area numeric,
  area_type integer,
  floor integer,
  deal_date date not null,
  deposit integer,            -- 만원
  monthly_rent integer,       -- 만원, 0 = 전세
  contract_type text,         -- 신규 / 갱신 (MOLIT, often empty before 2021)
  cancelled boolean not null default false
);
create index market_rents_place_idx on public.market_rents (place_id, area_type, deal_date desc);
create index market_rents_date_idx on public.market_rents (deal_date);

create table public.market_commercial_trades (
  id text primary key,
  kind text not null check (kind in ('land','commercial','house')),   -- 토지 / 상업업무용 / 단독다가구
  lawd text not null,
  sido text,
  sigungu text,
  umd text,
  jibun text,                 -- often masked by MOLIT ("1**")
  use_type text,              -- 지목 (토지) or 건물 주용도
  zone text,                  -- 용도지역
  land_area numeric,          -- ㎡ (토지 거래면적 / 대지면적)
  building_area numeric,      -- ㎡ (집합 상가 전용 등)
  total_floor_area numeric,   -- ㎡ 연면적
  floor integer,
  build_year integer,
  building_type text,         -- 집합 / 일반
  share boolean not null default false,   -- 지분 거래
  deal_date date not null,
  amount integer not null,    -- 만원
  direct boolean not null default false,
  cancelled boolean not null default false
);
create index market_commercial_trades_area_idx on public.market_commercial_trades (lawd, umd, kind, deal_date desc);
create index market_commercial_trades_date_idx on public.market_commercial_trades (deal_date);

alter table public.market_rents enable row level security;
alter table public.market_commercial_trades enable row level security;
create policy market_rents_read on public.market_rents for select to anon, authenticated using (true);
create policy market_commercial_trades_read on public.market_commercial_trades for select to anon, authenticated using (true);
revoke all on public.market_rents, public.market_commercial_trades from anon, authenticated;
grant select on public.market_rents, public.market_commercial_trades to anon, authenticated;
