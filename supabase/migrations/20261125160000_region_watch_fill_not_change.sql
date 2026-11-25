-- 2026-11-25 지역 감시: 비어 있던 초등학교·가까운 역이 새로 채워진 것은 "단지 내용 바뀜"으로 세지 않는다.
-- 사용자 지시 "둘 다 바꾸라고" (같은 날 텔레그램 "12시까지 아무 컴퓨터도 끝내지 못함").
--
-- 왜: 새 도에 학교·역을 처음 붙이는 날마다 그 도 단지 지문이 전부 바뀌어 경보가 났고, 단지·실거래 매일 작업이
-- 통째로 실패로 찍혔다 (11-19 광주 957/957, 11-24 강원·전북·충남·충북, 11-25 제주 190/190). 수집은 다 끝났는데
-- 실패로 보여 진짜 사고와 구분이 안 됐다.
--
-- 어떻게: 지문을 둘로 나눈다.
--   core_fp = 학교·역 뺀 나머지(이름·시도·시군구·동·세대·구분·분양형태·사용승인·좌표·법정동·PNU)
--   elementary_school, nearest_station_name = 값 그대로 보관
-- "바뀜" = core_fp가 다르다 / 있던 학교·역이 다른 값이 되거나 없어졌다.  빈 칸 → 값 은 "채움"(fp_filled)으로 따로 센다.
-- 경보 문턱(1% 이상, 최소 20곳)과 다른 경보 규칙은 그대로.
--
-- 옮겨 가기: 지금 남은 지문 중 현재 단지와 전체 지문이 같은 줄만 core_fp·학교·역을 채운다(오늘 아침 이후 안 바뀐 줄).
-- 그 사이 바뀐 줄은 core_fp가 비어 있어 예전처럼 전체 지문으로 비교한다(다음 실행에서 새 방식으로 저장됨).
-- 이 파일은 lineestate 저장소의 20261118180000_region_watch.sql 함수를 대신한다.
-- 되돌리기: 20261118180000_region_watch.sql 의 함수 본문을 다시 실행 (늘린 칸은 남아도 무해).

alter table app.complex_fingerprints add column if not exists core_fp text;
alter table app.complex_fingerprints add column if not exists elementary_school text;
alter table app.complex_fingerprints add column if not exists nearest_station_name text;

update app.complex_fingerprints o
set core_fp = md5(concat_ws('|', c.name, c.sido, c.sigungu, c.dong, c.households, c.section, c.sale_type, c.approved_on,
                            round(c.latitude::numeric, 6), round(c.longitude::numeric, 6), c.bjd_code, c.pnu)),
    elementary_school = c.elementary_school,
    nearest_station_name = c.nearest_station_name
from public.complexes c
where c.kapt_code = o.kapt_code and o.core_fp is null
  and o.fp = md5(concat_ws('|', c.name, c.sido, c.sigungu, c.dong, c.households, c.section, c.sale_type, c.approved_on,
                           round(c.latitude::numeric, 6), round(c.longitude::numeric, 6),
                           c.nearest_station_name, c.elementary_school, c.bjd_code, c.pnu));

create or replace function app.region_watch()
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
 set statement_timeout to '120s'
as $function$
declare
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_prev date;
  v_alerts jsonb := '[]'::jsonb;
  r record;
  v_p jsonb;
  v_c jsonb;
begin
  create temp table _fp on commit drop as
  select c.kapt_code, c.sido,
         md5(concat_ws('|', c.name, c.sido, c.sigungu, c.dong, c.households, c.section, c.sale_type, c.approved_on,
                       round(c.latitude::numeric, 6), round(c.longitude::numeric, 6),
                       c.nearest_station_name, c.elementary_school, c.bjd_code, c.pnu)) as fp,
         md5(concat_ws('|', c.name, c.sido, c.sigungu, c.dong, c.households, c.section, c.sale_type, c.approved_on,
                       round(c.latitude::numeric, 6), round(c.longitude::numeric, 6), c.bjd_code, c.pnu)) as core_fp,
         c.elementary_school, c.nearest_station_name
  from public.complexes c where c.kapt_code is not null;

  -- 학교·역: 있던 값이 달라지거나 없어지면 바뀜, 빈 칸이 채워지면 채움.
  create temp table _fpdiff on commit drop as
  with j as (
    select coalesce(n.sido, o.sido) as sido, o.kapt_code as o_code, n.kapt_code as n_code,
           case when o.kapt_code is null or n.kapt_code is null then null
                when o.core_fp is null then o.fp <> n.fp
                else o.core_fp <> n.core_fp
                  or (o.elementary_school is not null and o.elementary_school is distinct from n.elementary_school)
                  or (o.nearest_station_name is not null and o.nearest_station_name is distinct from n.nearest_station_name)
           end as changed,
           o.kapt_code is not null and n.kapt_code is not null and o.core_fp is not null and o.fp <> n.fp as differs
    from _fp n full join app.complex_fingerprints o on o.kapt_code = n.kapt_code
  )
  select sido,
         count(*) filter (where changed) as changed,
         count(*) filter (where differs and not changed) as filled,
         count(*) filter (where n_code is null) as removed,
         count(*) filter (where o_code is null) as added
  from j group by sido;

  for r in
    with s as (select distinct sido from public.complexes union select distinct sido from public.market_places)
    select s.sido,
      (select count(*) from public.complexes x where x.sido = s.sido) as complexes,
      (select count(*) from public.market_places x where x.sido = s.sido) as places,
      (select count(*) from public.market_area_stats x where x.sido = s.sido) as area_stats,
      (select count(*) from public.market_presale_trades x where x.sido = s.sido) as presale,
      (select count(*) from app.recommend_base_all x where x.sido = s.sido) as recommend_rows,
      coalesce((select changed from _fpdiff d where d.sido = s.sido), 0) as fp_changed,
      coalesce((select filled from _fpdiff d where d.sido = s.sido), 0) as fp_filled,
      coalesce((select removed from _fpdiff d where d.sido = s.sido), 0) as fp_removed,
      coalesce((select added from _fpdiff d where d.sido = s.sido), 0) as fp_added
    from s where s.sido is not null
  loop
    insert into app.region_daily (day, sido, metrics) values (v_day, r.sido, jsonb_build_object(
      'complexes', r.complexes, 'places', r.places, 'area_stats', r.area_stats, 'presale', r.presale,
      'recommend_rows', r.recommend_rows, 'fp_changed', r.fp_changed, 'fp_filled', r.fp_filled,
      'fp_removed', r.fp_removed, 'fp_added', r.fp_added))
    on conflict (day, sido) do update set metrics = excluded.metrics, created_at = now();
  end loop;

  for r in select p.sido, count(*) as n from public.market_trades t join public.market_places p on p.id = t.place_id group by p.sido loop
    update app.region_daily set metrics = metrics || jsonb_build_object('trades', r.n) where day = v_day and sido = r.sido;
  end loop;
  for r in select p.sido, count(*) as n from public.market_rents t join public.market_places p on p.id = t.place_id group by p.sido loop
    update app.region_daily set metrics = metrics || jsonb_build_object('rents', r.n) where day = v_day and sido = r.sido;
  end loop;

  insert into app.region_daily (day, sido, metrics) values (v_day, '*', jsonb_build_object(
    'stations', (select count(*) from public.rail_stations),
    'elementary_zones', (select count(*) from public.elementary_zones),
    'elementary_schools', (select count(*) from public.elementary_schools),
    'commutes', (select count(*) from public.complex_commutes)))
  on conflict (day, sido) do update set metrics = excluded.metrics, created_at = now();

  delete from app.complex_fingerprints o where not exists (select 1 from _fp n where n.kapt_code = o.kapt_code);
  insert into app.complex_fingerprints (kapt_code, sido, fp, core_fp, elementary_school, nearest_station_name, seen_on)
  select kapt_code, sido, fp, core_fp, elementary_school, nearest_station_name, v_day from _fp
  on conflict (kapt_code) do update set sido = excluded.sido, fp = excluded.fp, core_fp = excluded.core_fp,
    elementary_school = excluded.elementary_school, nearest_station_name = excluded.nearest_station_name, seen_on = excluded.seen_on;

  select max(day) into v_prev from app.region_daily where day < v_day;
  if v_prev is not null then
    for r in select t.sido, t.metrics as cur, y.metrics as prev
             from app.region_daily t left join app.region_daily y on y.day = v_prev and y.sido = t.sido
             where t.day = v_day loop
      v_c := r.cur; v_p := coalesce(r.prev, '{}'::jsonb);
      if r.sido = '*' then
        if (v_c->>'stations')::numeric < (v_p->>'stations')::numeric * 0.99 then v_alerts := v_alerts || jsonb_build_object('sido', '*', 'what', '역', 'from', v_p->'stations', 'to', v_c->'stations'); end if;
        if (v_c->>'elementary_zones')::numeric < (v_p->>'elementary_zones')::numeric * 0.99 then v_alerts := v_alerts || jsonb_build_object('sido', '*', 'what', '초등 학구', 'from', v_p->'elementary_zones', 'to', v_c->'elementary_zones'); end if;
        if (v_c->>'elementary_schools')::numeric < (v_p->>'elementary_schools')::numeric * 0.99 then v_alerts := v_alerts || jsonb_build_object('sido', '*', 'what', '초등학교', 'from', v_p->'elementary_schools', 'to', v_c->'elementary_schools'); end if;
        continue;
      end if;
      if r.prev is null then continue; end if;
      if (v_c->>'complexes')::numeric < (v_p->>'complexes')::numeric then v_alerts := v_alerts || jsonb_build_object('sido', r.sido, 'what', '단지 수 줄어듦', 'from', v_p->'complexes', 'to', v_c->'complexes'); end if;
      if (v_c->>'fp_removed')::numeric > 0 then v_alerts := v_alerts || jsonb_build_object('sido', r.sido, 'what', '단지 사라짐', 'to', v_c->'fp_removed'); end if;
      if (v_c->>'fp_changed')::numeric >= 20 and (v_c->>'fp_changed')::numeric > (v_p->>'complexes')::numeric * 0.01 then v_alerts := v_alerts || jsonb_build_object('sido', r.sido, 'what', '기존 단지 내용 바뀜(이름·주소·좌표·있던 학교·역 등)', 'to', v_c->'fp_changed', 'of', v_p->'complexes'); end if;
      if (v_c->>'places')::numeric < (v_p->>'places')::numeric then v_alerts := v_alerts || jsonb_build_object('sido', r.sido, 'what', '실거래 장소 줄어듦', 'from', v_p->'places', 'to', v_c->'places'); end if;
      if coalesce((v_c->>'trades')::numeric, 0) < coalesce((v_p->>'trades')::numeric, 0) * 0.99 then v_alerts := v_alerts || jsonb_build_object('sido', r.sido, 'what', '매매 1% 넘게 줄어듦', 'from', v_p->'trades', 'to', v_c->'trades'); end if;
      if coalesce((v_c->>'rents')::numeric, 0) < coalesce((v_p->>'rents')::numeric, 0) * 0.99 then v_alerts := v_alerts || jsonb_build_object('sido', r.sido, 'what', '전월세 1% 넘게 줄어듦', 'from', v_p->'rents', 'to', v_c->'rents'); end if;
      if (v_c->>'recommend_rows')::numeric < (v_p->>'recommend_rows')::numeric * 0.97 then v_alerts := v_alerts || jsonb_build_object('sido', r.sido, 'what', '추천 바탕 3% 넘게 줄어듦', 'from', v_p->'recommend_rows', 'to', v_c->'recommend_rows'); end if;
    end loop;
    for r in select y.sido from app.region_daily y where y.day = v_prev and y.sido <> '*'
             and not exists (select 1 from app.region_daily t where t.day = v_day and t.sido = y.sido) loop
      v_alerts := v_alerts || jsonb_build_object('sido', r.sido, 'what', '시도 자료가 통째로 사라짐');
    end loop;
  end if;

  delete from app.region_daily where day < v_day - 400;
  return jsonb_build_object('day', v_day, 'prev', v_prev, 'alerts', v_alerts,
    'today', (select jsonb_object_agg(sido, metrics) from app.region_daily where day = v_day));
end;
$function$;
