-- 평형별 임대 판정 (국토교통부 마이홈포털 공공임대주택 단지정보, data.go.kr 15110581). lineestate reads these to tell
-- which 평형 of a complex hold public rentals. Loaded by scripts/detail/rental-supply.mjs. 매입임대 is left out.
-- No row for a complex means it could not be judged, not that it has no rentals.
create table public.complex_rental_supplies (
  kapt_code text not null,
  hsmp_sn bigint not null,               -- 마이홈 단지 식별자
  supply_type text not null,             -- 국민임대, 장기전세, 행복주택, ...
  style_name text not null default '',   -- 형명
  exclusive_area numeric,                -- ㎡
  area_type integer,                     -- floor(전용면적), same as market_rents.area_type
  type_households integer,               -- 이 단지·공급유형의 합계 세대. 형별 세대가 아니다
  institution text,
  hsmp_name text,
  base_deposit bigint,                   -- 기본 임대보증금 (원)
  base_monthly_rent bigint,              -- 기본 월임대료 (원)
  matched_by text not null check (matched_by in ('pnu','road')),
  fetched_at timestamptz not null default now(),
  primary key (kapt_code, hsmp_sn, supply_type, style_name)
);

create table public.complex_area_rental (
  kapt_code text not null,
  area_type integer not null,
  households integer,                    -- 전유부 기준 이 평형 세대. 모르면 null
  status text not null check (status in ('rental_only','has_rental','none','unknown')),
  rental_min integer,                    -- 세대수에서 계산한 이 평형 임대 세대의 하한·상한. 계산할 수 없으면 null
  rental_max integer,
  supply_types text[] not null default '{}',
  computed_at timestamptz not null default now(),
  primary key (kapt_code, area_type)
);
create index complex_area_rental_status on public.complex_area_rental (status);

alter table public.complex_rental_supplies enable row level security;
alter table public.complex_area_rental enable row level security;
create policy complex_rental_supplies_read on public.complex_rental_supplies for select to anon, authenticated using (true);
create policy complex_area_rental_read on public.complex_area_rental for select to anon, authenticated using (true);
revoke all on public.complex_rental_supplies, public.complex_area_rental from anon, authenticated;
grant select on public.complex_rental_supplies, public.complex_area_rental to anon, authenticated;
