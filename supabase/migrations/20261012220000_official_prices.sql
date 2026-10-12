-- 공동주택 공시가격 (국토교통부 브이월드 getApartHousingPriceAttr, 출처표시 이용).
-- Filled by scripts/geo/official-price.mjs. Amounts in 원. Officetels are not 공동주택 and have none.

-- One row per auction/public-sale property whose unit (동·호) was found.
create table public.property_official_prices (
  property_id uuid primary key references public.properties(id) on delete cascade,
  price bigint not null,               -- 공시가격
  year integer not null,               -- 기준연도
  dong_name text, ho_name text,        -- as matched in the 공시가격 data
  area numeric,                        -- 전용면적 in the 공시가격 data
  checked_at timestamptz not null
);

-- Median 공시가격 per complex and 평형 type (전용 ㎡, truncated like market_area_stats).
create table public.complex_official_prices (
  kapt_code text not null,
  area_type integer not null,
  year integer not null,
  median_price bigint not null,
  min_price bigint not null,
  max_price bigint not null,
  units integer not null,
  checked_at timestamptz not null,
  primary key (kapt_code, area_type)
);

alter table public.property_official_prices enable row level security;
alter table public.complex_official_prices enable row level security;
create policy property_official_prices_read on public.property_official_prices for select to anon, authenticated using (true);
create policy complex_official_prices_read on public.complex_official_prices for select to anon, authenticated using (true);
revoke all on public.property_official_prices, public.complex_official_prices from anon, authenticated;
grant select on public.property_official_prices, public.complex_official_prices to anon, authenticated;
