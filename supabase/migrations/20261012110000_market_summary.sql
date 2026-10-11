-- Screen-ready MOLIT trade summaries for lineestate (아파트·오피스텔). The full 3-year record
-- stays in the local warehouse (data/molit/warehouse.sqlite); scripts/molit/publish.mjs
-- rebuilds these tables from it. All amounts are in 만원, as MOLIT reports them.

-- One row per building as MOLIT files it (kind + 시군구 + 법정동 + 지번).
create table public.market_places (
  id text primary key,                 -- '<kind>:<lawd>:<umd>:<jibun>'
  kind text not null check (kind in ('apt','offi')),
  lawd text not null,                  -- MOLIT 시군구 code (5)
  sido text, sigungu text, umd text not null, jibun text not null,
  bjd_code text, pnu text,
  name text,                           -- latest name MOLIT used
  build_year integer,
  kapt_code text,                      -- matched K-APT complex (public.complexes.kapt_code)
  refreshed_at timestamptz not null
);
create index market_places_kapt_idx on public.market_places (kapt_code);
create index market_places_pnu_idx on public.market_places (pnu);
create index market_places_area_idx on public.market_places (lawd, umd);

-- Last 12 months per building and exclusive area (㎡ as filed).
create table public.market_area_stats (
  place_id text not null references public.market_places(id) on delete cascade,
  area numeric not null,
  sale_count integer not null,         -- valid sales (cancelled and 직거래 excluded)
  sale_median integer, sale_min integer, sale_max integer,
  sale_last_amount integer, sale_last_date date, sale_last_floor integer,
  jeonse_count integer not null, jeonse_median integer,
  wolse_count integer not null,
  jeonse_ratio numeric,                -- jeonse_median / sale_median (%)
  period_start date not null, period_end date not null,
  refreshed_at timestamptz not null,
  primary key (place_id, area)
);

-- Individual sales of the last 12 months, including cancelled and 직거래 rows so screens can
-- show what was excluded and why.
create table public.market_trades (
  id text primary key,                 -- warehouse key
  place_id text not null references public.market_places(id) on delete cascade,
  area numeric not null,
  floor integer, building text,
  deal_date date not null,
  amount integer not null,
  direct boolean not null,             -- 직거래
  cancelled boolean not null,          -- 계약 해제 신고됨
  refreshed_at timestamptz not null
);
create index market_trades_place_idx on public.market_trades (place_id, area, deal_date desc);

alter table public.market_places enable row level security;
alter table public.market_area_stats enable row level security;
alter table public.market_trades enable row level security;
create policy market_places_read on public.market_places for select to anon, authenticated using (true);
create policy market_area_stats_read on public.market_area_stats for select to anon, authenticated using (true);
create policy market_trades_read on public.market_trades for select to anon, authenticated using (true);
revoke all on public.market_places, public.market_area_stats, public.market_trades from anon, authenticated;
grant select on public.market_places, public.market_area_stats, public.market_trades to anon, authenticated;

-- Group by area type: Korean 평형 names truncate the exclusive area (84.94/84.98㎡ → 84형).
truncate public.market_area_stats;
alter table public.market_area_stats rename column area to area_type;
alter table public.market_area_stats alter column area_type type integer;
alter table public.market_trades add column area_type integer;
update public.market_trades set area_type = floor(area)::int;
alter table public.market_trades alter column area_type set not null;
drop index public.market_trades_place_idx;
create index market_trades_place_idx on public.market_trades (place_id, area_type, deal_date desc);

-- Stale-row cleanup after each publish filters on refreshed_at.
create index market_trades_refreshed_idx on public.market_trades (refreshed_at);
create index market_area_stats_refreshed_idx on public.market_area_stats (refreshed_at);
create index market_places_refreshed_idx on public.market_places (refreshed_at);

-- Sales are synced by difference (immutable rows), so they carry no refreshed_at.
drop index public.market_trades_refreshed_idx;
alter table public.market_trades drop column refreshed_at;
