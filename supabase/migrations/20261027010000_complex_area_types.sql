-- 단지 × 전용면적 타입별 대표 공급면적·평형·세대수 ("25평형", "평형 세대 68세대"), from 건축HUB 대용량
-- 건축물대장 전유공용면적 (호마다 전유·공용면적, 매월 갱신; "출처: 국토교통부 건축물대장").
-- 공급면적 = 전용면적 + 주거공용면적 (계단·복도·벽체 등; 지하층과 주차장·관리시설 같은 기타공용은 뺀다).
-- A type's supply_area is the most common value among its units; supply_share says how many agree.
-- Written by scripts/complex/area-types.mjs.
create table public.complex_area_types (
  kapt_code text not null references public.complexes (kapt_code) on delete cascade,
  exclusive_area numeric(7,2) not null,   -- 전용면적 ㎡ (대장 값, 소수 둘째 자리)
  supply_area numeric(7,2) not null,      -- 대표 공급면적 ㎡
  pyeong smallint not null,               -- round(supply_area / 3.3058)
  households integer not null,            -- 이 타입의 세대(호) 수
  supply_share real not null,             -- 대표값과 같은 공급면적인 호의 비율 (0~1)
  source_month text not null check (source_month ~ '^\d{4}-\d{2}$'),  -- 건축물대장 기준월
  computed_at timestamptz not null default now(),
  primary key (kapt_code, exclusive_area)
);
alter table public.complex_area_types enable row level security;
create policy complex_area_types_read on public.complex_area_types for select to anon, authenticated using (true);
revoke all on public.complex_area_types from anon, authenticated;
grant select on public.complex_area_types to anon, authenticated;
comment on table public.complex_area_types is '단지 전용면적 타입별 대표 공급면적·평형·세대수. 출처: 국토교통부 건축물대장 (전유공용면적)';
