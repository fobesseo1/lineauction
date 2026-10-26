-- 동네 환경 per complex (lineestate '주변 환경' 점수용), from OpenStreetMap (© OpenStreetMap contributors,
-- ODbL). Straight-line distances from the complex point; null when nothing within 3 km.
-- Written by scripts/geo/neighborhood.mjs (OSM refetched monthly, complexes daily).
alter table public.complexes
  add column park_nearest_m integer,             -- edge of the nearest named park of 1,500㎡ or more (0 inside)
  add column park_nearest_name text,
  add column park_nearest_area_m2 integer,
  add column park_area_500m_m2 integer,          -- park ground inside the 500 m circle, any size, 100㎡ steps
  add column kids_park_count_500m smallint,      -- named 어린이공원 (under 1,500㎡ or so named) within 500 m
  add column mart_nearest_m integer,             -- 대형마트·백화점·대형 쇼핑몰 (SSM·편의점 excluded)
  add column mart_nearest_name text,
  add column mart_count_1km smallint,
  add column neighborhood_computed_at timestamptz;
comment on column public.complexes.park_nearest_m is '가장 가까운 공원(1,500㎡ 이상, 이름 있는 곳) 경계까지 직선 m. © OpenStreetMap contributors';
comment on column public.complexes.park_area_500m_m2 is '반경 500m 원 안의 공원 면적 합(㎡, 100 단위). © OpenStreetMap contributors';
comment on column public.complexes.kids_park_count_500m is '500m 안 어린이공원(1,500㎡ 미만 또는 이름이 어린이공원, 이름 있는 곳만) 수. © OpenStreetMap contributors';
comment on column public.complexes.mart_nearest_m is '가장 가까운 대형마트·백화점 직선 m (SSM·편의점 제외). © OpenStreetMap contributors';
comment on column public.complexes.mart_count_1km is '1km 안 대형마트·백화점 수. © OpenStreetMap contributors';
