-- 단지 상세 화면용 공공 자료 (scripts/detail/*). lineestate reads these; it never calls the public APIs.
-- Every complex-linked row is keyed on complexes.kapt_code.

-- 전월세 계약 만기 ('곧 나올 전세'). 국토교통부 실거래의 contractTerm, 36 months back; grouped because the
-- filings identify no unit. A 갱신 filing also ends its earlier contract, so counts are an upper bound.
create table public.market_rent_expiries (
  place_id text not null references public.market_places (id) on delete cascade,
  kapt_code text,                        -- market_places.kapt_code when known
  area_type integer not null,            -- floor(전용면적), same as market_rents.area_type
  end_month text not null check (end_month ~ '^\d{4}-\d{2}$'),
  contracts integer not null,
  jeonse integer not null,
  monthly integer not null,
  renewed integer not null,              -- contract_type = 갱신
  jeonse_median_deposit integer,         -- 만원
  last_deal_date date,
  computed_at timestamptz not null default now(),
  primary key (place_id, area_type, end_month)
);
create index market_rent_expiries_kapt on public.market_rent_expiries (kapt_code, end_month);

-- 관리비 per complex per month (K-APT). Amounts are 원 for the whole complex.
create table public.complex_maintenance_fees (
  kapt_code text not null references public.complexes (kapt_code) on delete cascade,
  ym text not null check (ym ~ '^\d{4}-\d{2}$'),
  -- 공용관리비
  labor bigint, office bigint, tax bigint, clothing bigint, training bigint, vehicle bigint, other_overhead bigint,
  cleaning bigint, guard bigint, disinfection bigint, elevator bigint, home_network bigint, repairs bigint,
  facility bigint, safety_check bigint, disaster bigint, consign bigint,
  -- 개별사용료 (_private 전용, _common 공용)
  heat_private bigint, heat_common bigint, hot_water_private bigint, hot_water_common bigint, gas_private bigint, gas_common bigint,
  electric_private bigint, electric_common bigint, water_private bigint, water_common bigint,
  waste bigint, resident_meeting bigint, insurance bigint, election bigint, septic bigint,
  -- 장기수선충당금
  reserve_levy bigint, reserve_used bigint, reserve_balance bigint, reserve_rate numeric,
  -- 합계와 나눈 값 (원). total = common_total + individual_total + reserve_levy
  common_total bigint, individual_total bigint, total bigint,
  management_area numeric, households integer,      -- 나눌 때 쓴 값 (complexes)
  common_per_m2 integer, total_per_m2 integer, total_per_household integer,
  fetched_at timestamptz not null,
  primary key (kapt_code, ym)
);
create index complex_maintenance_fees_ym on public.complex_maintenance_fees (ym);

-- 학교 (학교알리미): 학교 기본정보 + 학년별·학급별 학생수 공시.
create table public.schools (
  school_code text primary key,          -- 정보공시 학교코드
  name text not null,
  kind text check (kind in ('elementary','middle','high')),
  region_code text,
  address text,
  founding text,
  coed text,
  latitude double precision,
  longitude double precision,
  year integer not null,                 -- 공시 연도
  classes integer,
  students integer,
  students_per_class numeric,
  grade_students_per_class jsonb,        -- {"1": 22.1, ...}
  updated_at timestamptz not null default now()
);
create table public.complex_schools (
  kapt_code text not null references public.complexes (kapt_code) on delete cascade,
  school_code text not null references public.schools (school_code) on delete cascade,
  kind text,
  distance_m integer not null,
  is_assigned boolean not null default false,  -- complexes.elementary_school 과 같은 학교
  primary key (kapt_code, school_code)
);
create index complex_schools_school on public.complex_schools (school_code);

-- 어린이집 (보육통합정보) · 유치원 (유치원알리미).
create table public.childcare_facilities (
  id text primary key,                   -- cc:<어린이집코드> / kg:<유치원코드>
  kind text not null check (kind in ('daycare','kindergarten')),
  name text not null,
  type_name text,                        -- 원문: 국공립, 민간, 가정, 사립(사인) ...
  type_code text,                        -- public|welfare|corporate|private|home|cooperative|workplace|other
  status text,
  sido text,
  sigungu text,
  address text,
  capacity integer,
  current_children integer,
  latitude double precision,
  longitude double precision,
  updated_at timestamptz not null default now()
);
create table public.complex_childcare (
  kapt_code text not null references public.complexes (kapt_code) on delete cascade,
  facility_id text not null references public.childcare_facilities (id) on delete cascade,
  kind text not null,
  type_code text,
  distance_m integer not null,
  primary key (kapt_code, facility_id)
);
create index complex_childcare_facility on public.complex_childcare (facility_id);

-- 동별 표제부 (건축물대장). register_pk = 관리건축물대장 PK.
create table public.complex_buildings (
  kapt_code text not null references public.complexes (kapt_code) on delete cascade,
  register_pk text not null,
  pnu text,
  dong_name text,
  building_name text,
  main_purpose text,
  ground_floors integer,
  basement_floors integer,
  households integer,
  height_m numeric,
  elevators integer,
  structure text,
  approved_on date,
  updated_at timestamptz not null default now(),
  primary key (kapt_code, register_pk)
);
-- 동 × 전용 타입 세대 수 (건축물대장 전유부, 호 단위 집계). 공급면적·평형은 complex_area_types 와 전용면적으로 잇는다.
create table public.complex_dong_types (
  kapt_code text not null references public.complexes (kapt_code) on delete cascade,
  dong_name text not null,               -- 대장에 동이 비어 있으면 ''
  exclusive_area numeric(7,2) not null,
  households integer not null,
  source_month text not null,
  primary key (kapt_code, dong_name, exclusive_area)
);

-- 버스 정류장 (TAGO + 서울 열린데이터).
create table public.bus_stops (
  id text primary key,
  name text,
  latitude double precision not null,
  longitude double precision not null,
  sido text,
  city text,
  ars_no text,
  source text not null,                  -- tago | seoul
  is_express boolean,                    -- 광역·직행좌석 노선이 선다 (null: 노선 자료를 아직 못 받음)
  express_routes text[],
  updated_at timestamptz not null default now()
);
create table public.complex_bus_stops (
  kapt_code text not null references public.complexes (kapt_code) on delete cascade,
  stop_id text not null references public.bus_stops (id) on delete cascade,
  distance_m integer not null,
  is_express boolean,
  primary key (kapt_code, stop_id)
);
create index complex_bus_stops_stop on public.complex_bus_stops (stop_id);

do $$
declare t text;
begin
  foreach t in array array['market_rent_expiries','complex_maintenance_fees','schools','complex_schools','childcare_facilities','complex_childcare','complex_buildings','complex_dong_types','bus_stops','complex_bus_stops'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t||'_read', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end $$;
