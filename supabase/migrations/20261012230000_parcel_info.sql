-- Parcel facts for the 상가·건물·토지 section, one row per PNU (scripts/geo/parcel-info.mjs):
--   개별공시지가 and 토지이용계획 from vworld (출처: 국토교통부 브이월드),
--   building summary from the building register (건축HUB 표제부).
create table public.parcel_info (
  pnu text primary key check (pnu ~ '^\d{19}$'),
  land_price_per_m2 bigint,            -- 개별공시지가 (원/㎡)
  land_price_year integer,
  zone text,                           -- 용도지역, e.g. 제2종일반주거지역
  overlays text[],                     -- other 포함 지역·지구·구역 (지구단위계획구역 …)
  building_name text,
  main_use text,                       -- 주용도
  use_approved_year integer,           -- 사용승인 연도
  floor_area_ratio numeric,            -- 용적률 (%)
  coverage_ratio numeric,              -- 건폐율 (%)
  total_floor_area numeric,            -- 연면적 (㎡)
  plot_area numeric,                   -- 대지면적 (㎡)
  floors_above integer,
  floors_below integer,
  checked_at timestamptz not null
);
alter table public.parcel_info enable row level security;
create policy parcel_info_read on public.parcel_info for select to anon, authenticated using (true);
revoke all on public.parcel_info from anon, authenticated;
grant select on public.parcel_info to anon, authenticated;
