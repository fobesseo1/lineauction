-- 역↔역 대중교통 시간 (lineestate가 "단지 → 가까운 역 → 직장 가까운 역"으로 통근을 어림하는 표).
-- minutes = 첫 대기 3 + 역 사이 이동 + 환승마다 5, with neither walk: complex_commutes is this plus
-- 집→역 도보 and 도착역→목적지 도보 5. Same OSM line graph (© OpenStreetMap contributors, ODbL).
-- Both directions are stored (the graph is symmetric); a station to itself has no row (0 분).
-- Station ids are rail_stations.id (names repeat: 양평, 신촌). Written by scripts/geo/stations.mjs.
create table public.station_to_station_minutes (
  from_station_id text not null references public.rail_stations (id) on delete cascade,
  to_station_id text not null references public.rail_stations (id) on delete cascade,
  minutes smallint not null,
  transfers smallint not null,
  computed_at timestamptz not null default now(),
  primary key (from_station_id, to_station_id)
);
create index station_to_station_minutes_to_idx on public.station_to_station_minutes (to_station_id);
alter table public.station_to_station_minutes enable row level security;
create policy station_to_station_minutes_read on public.station_to_station_minutes for select to anon, authenticated using (true);
revoke all on public.station_to_station_minutes from anon, authenticated;
grant select on public.station_to_station_minutes to anon, authenticated;
comment on table public.station_to_station_minutes is '역↔역 대중교통 추정 시간: 첫 대기 3 + 역 사이 이동 + 환승마다 5 (도보 제외). © OpenStreetMap contributors (ODbL). scripts/geo/stations.mjs';
