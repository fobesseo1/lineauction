-- 동네 환경 ③④ per complex (lineestate '주변 환경' 점수용), from 소상공인시장진흥공단 상가(상권)정보
-- ("출처: 소상공인시장진흥공단 상가(상권)정보", 분기 갱신). Straight-line distances from the complex point.
-- Written by scripts/geo/neighborhood.mjs (source refetched monthly, complexes daily).
alter table public.complexes
  add column general_hospital_m integer,         -- nearest 종합병원 (업종 Q10101); null beyond 10 km
  add column general_hospital_name text,
  add column clinic_count_1km smallint,          -- 의원 (Q102: 내과·소아과·치과·한의원 등) within 1 km
  add column academy_count_500m smallint,        -- 입시·교과학원 and 외국어학원 (P10501, P10615)
  add column academy_count_1km smallint;
comment on column public.complexes.general_hospital_m is '가장 가까운 종합병원 직선 m (10km 넘으면 null). 출처: 소상공인시장진흥공단 상가(상권)정보';
comment on column public.complexes.clinic_count_1km is '1km 안 의원 수 (치과·한의원 포함). 출처: 소상공인시장진흥공단 상가(상권)정보';
comment on column public.complexes.academy_count_500m is '500m 안 입시·교과·외국어 학원 수. 출처: 소상공인시장진흥공단 상가(상권)정보';
comment on column public.complexes.academy_count_1km is '1km 안 입시·교과·외국어 학원 수. 출처: 소상공인시장진흥공단 상가(상권)정보';
