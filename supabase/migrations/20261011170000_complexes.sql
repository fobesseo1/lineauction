-- Capital-area apartment complex master (서울·경기·인천), first filled from K-APT
-- (공동주택 단지 목록 + 기본·상세 정보). Small complexes and officetels without a K-APT
-- code come later from the building register, so kapt_code is nullable.
-- Public read like properties; writes only through the service role (collectors).
create table public.complexes (
  id bigint generated always as identity primary key,
  kapt_code text unique,
  name text not null,
  section text not null default 'apartment' check (section in ('apartment','commercial')),
  complex_kind text,               -- K-APT codeAptNm, e.g. 아파트 / 주상복합 / 도시형 생활주택(아파트)
  sido text not null,
  sigungu text,
  dong text,
  bjd_code text check (bjd_code ~ '^\d{10}$'),
  pnu text check (pnu ~ '^\d{19}$'),
  jibun_address text,
  road_address text,
  latitude double precision,
  longitude double precision,
  households integer,
  dong_count integer,
  ho_count integer,
  approved_on date,                -- 사용승인일
  sale_type text,                  -- 분양/임대/혼합
  heating text,
  hall_type text,
  management_type text,
  structure text,
  builder text,
  developer text,
  total_floor_area numeric,
  management_area numeric,
  private_area numeric,
  units_le60 integer,              -- 전용면적별 세대수
  units_le85 integer,
  units_le135 integer,
  units_gt135 integer,
  parking_ground integer,
  parking_underground integer,
  elevators integer,
  ev_chargers_ground integer,
  ev_chargers_underground integer,
  subway_line text,
  subway_station text,
  subway_walk text,
  bus_walk text,
  basis_raw jsonb,
  detail_raw jsonb,
  list_seen_at timestamptz,        -- last time the K-APT list returned this code
  basis_fetched_at timestamptz,
  detail_fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index complexes_bjd_code_idx on public.complexes (bjd_code);
create index complexes_pnu_idx on public.complexes (pnu);
create index complexes_region_idx on public.complexes (sido, sigungu);

alter table public.complexes enable row level security;
create policy complexes_read on public.complexes for select to anon, authenticated using (true);
revoke all on public.complexes from anon, authenticated;
grant select (id, kapt_code, name, section, complex_kind, sido, sigungu, dong, bjd_code, pnu,
  jibun_address, road_address, latitude, longitude, households, dong_count, ho_count, approved_on,
  sale_type, heating, hall_type, management_type, structure, builder, developer, total_floor_area,
  management_area, private_area, units_le60, units_le85, units_le135, units_gt135, parking_ground,
  parking_underground, elevators, ev_chargers_ground, ev_chargers_underground, subway_line,
  subway_station, subway_walk, bus_walk, updated_at)
  on public.complexes to anon, authenticated;
