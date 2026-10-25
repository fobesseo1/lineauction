-- 수도권 전철역 and each complex's nearest two (lineestate 역 거리 재검증). Source: OpenStreetMap
-- (© OpenStreetMap contributors, ODbL) — the site must show that attribution where it uses these.
-- Distance is straight-line to the closest point of a 환승역; walk = m × 1.3 ÷ 67 (4 km/h).
-- Written by scripts/geo/stations.mjs (weekly OSM refresh, daily nearest-station pass).
create table public.rail_stations (
  id text primary key,             -- osm:<node|way|relation>/<id> of the station's first point
  name text not null,              -- without the 역 suffix, as on the line maps
  lines text[] not null,           -- 1호선 … 9호선, 수인분당선, 신분당선, 경의중앙선, GTX-A, 인천1호선 …
  latitude double precision not null,
  longitude double precision not null,
  osm_ids text[] not null,         -- every OSM station point merged into this station
  updated_at timestamptz not null default now()
);
create index rail_stations_lines_idx on public.rail_stations using gin (lines);
alter table public.rail_stations enable row level security;
create policy rail_stations_read on public.rail_stations for select to anon, authenticated using (true);
revoke all on public.rail_stations from anon, authenticated;
grant select on public.rail_stations to anon, authenticated;

alter table public.complexes
  add column nearest_station_name text,
  add column nearest_station_lines text[],
  add column nearest_station_m integer,
  add column nearest_station_walk_min integer,
  add column second_station_name text,
  add column second_station_lines text[],
  add column second_station_m integer,
  add column second_station_walk_min integer,
  add column stations_computed_at timestamptz;

grant select (nearest_station_name, nearest_station_lines, nearest_station_m, nearest_station_walk_min,
  second_station_name, second_station_lines, second_station_m, second_station_walk_min, stations_computed_at)
  on public.complexes to anon, authenticated;
