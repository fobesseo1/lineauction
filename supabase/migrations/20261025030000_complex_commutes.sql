-- 단지 → 주요 업무지구 대중교통 시간 (lineestate 점수용 추정치, 지도 길찾기 대비 ±10분).
-- minutes = 집→역 도보 + 첫 대기 3 + 역 사이 이동 + 환승마다 5 + 도착역→목적지 도보 5, over the
-- rail_stations line graph (OpenStreetMap, © OpenStreetMap contributors, ODbL). Complexes whose
-- nearest station is over 2 km away have no rows. Written by scripts/geo/stations.mjs.
create table public.complex_commutes (
  kapt_code text not null references public.complexes (kapt_code) on delete cascade,
  destination text not null check (destination in ('여의도','강남','광화문','판교','마곡','잠실','구로디지털단지','성수','용산','송도')),
  minutes integer not null,
  transfers integer not null,
  from_station text not null,      -- the station the fastest trip starts from (nearest 1·2위)
  computed_at timestamptz not null default now(),
  primary key (kapt_code, destination)
);
create index complex_commutes_destination_minutes_idx on public.complex_commutes (destination, minutes);
alter table public.complex_commutes enable row level security;
create policy complex_commutes_read on public.complex_commutes for select to anon, authenticated using (true);
revoke all on public.complex_commutes from anon, authenticated;
grant select on public.complex_commutes to anon, authenticated;
