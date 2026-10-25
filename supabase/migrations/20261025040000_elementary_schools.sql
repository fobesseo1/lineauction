-- 초등학교 통학구역과 학교 위치, and each complex's 배정 초등학교 (lineestate 점수용).
-- Zones: vworld LT_C_DESCH (교육부 학구도, "출처: 교육부 학구도안내서비스·국토교통부 브이월드").
-- School points: OpenStreetMap (© OpenStreetMap contributors, ODbL), matched to zones by name.
-- Written by scripts/geo/schools.mjs (sources refetched monthly, complexes assigned daily).
create table public.elementary_zones (
  id text primary key,               -- hakgudo_id, e.g. Z000100410
  name text not null,                -- 서울서이초통학구역 / …공동통학구역
  shared boolean not null,           -- 공동통학구역: more than one school
  school_names text[] not null,
  base_dt date,
  geometry jsonb not null,           -- GeoJSON (EPSG:4326), coordinates rounded to 6 decimals
  updated_at timestamptz not null default now()
);
create table public.elementary_schools (
  id text primary key,               -- osm:<type>/<id>
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  zone_ids text[] not null,
  updated_at timestamptz not null default now()
);
alter table public.elementary_zones enable row level security;
alter table public.elementary_schools enable row level security;
create policy elementary_zones_read on public.elementary_zones for select to anon, authenticated using (true);
create policy elementary_schools_read on public.elementary_schools for select to anon, authenticated using (true);
revoke all on public.elementary_zones, public.elementary_schools from anon, authenticated;
grant select on public.elementary_zones, public.elementary_schools to anon, authenticated;

-- elementary_school_m is null when the school's point is unknown (about 9% of schools are not in OSM).
alter table public.complexes
  add column elementary_school text,
  add column elementary_school_m integer,
  add column elementary_zone_id text,
  add column elementary_zone_shared boolean,
  add column elementary_zone_schools text[],
  add column elementary_computed_at timestamptz;
grant select (elementary_school, elementary_school_m, elementary_zone_id, elementary_zone_shared,
  elementary_zone_schools, elementary_computed_at)
  on public.complexes to anon, authenticated;
