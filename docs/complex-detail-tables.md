# 단지 상세 자료 표 (lineestate가 읽는 것)

모두 `public` 스키마, anon·authenticated `select` 가능. 단지와는 `kapt_code`(`complexes.kapt_code`)로 잇는다.
수집기: `scripts/detail/`. 지역 설정: `scripts/detail/regions.json`. 연결 비율 확인: `node scripts/detail/coverage.mjs`.

## 관리비 `complex_maintenance_fees` (PK `kapt_code, ym`)

K-APT 공용관리비·개별사용료·장기수선충당금. 금액은 **단지 전체, 원**.

| 묶음 | 열 |
|---|---|
| 기준 | `ym`('2026-08'), `fetched_at` |
| 계산용 | `management_area`(㎡), `households` |
| 합계 | `common_total`, `individual_total`, `reserve_levy`, `total`(앞의 셋 합) |
| 나눈 값 | `common_per_m2`, `total_per_m2`, `total_per_household` (원) |
| 공용 | `labor, office, tax, clothing, training, vehicle, other_overhead, cleaning, guard, disinfection, elevator, home_network, repairs, facility, safety_check, disaster, consign` |
| 개별 (`_private` 전용, `_common` 공용) | `heat_*, hot_water_*, gas_*, electric_*, water_*`, `waste, resident_meeting, insurance, election, septic` |
| 장기수선 | `reserve_levy`(월부과액), `reserve_used`, `reserve_balance`, `reserve_rate`(%) |

주의: 난방비가 큰 겨울과 여름은 값이 크게 다르다. 화면에 기준 월을 함께 보여 준다. `management_area`는 `complexes`와 같은 값이다.

## 학교 `schools` (PK `school_code`), `complex_schools` (PK `kapt_code, school_code`)

- `schools`: `name, kind`('elementary'|'middle'|'high'), `region_code, address, founding, coed, latitude, longitude, year`(공시 연도), `classes, students, students_per_class`, `grade_students_per_class`({"1": 22.1, ...}), `updated_at`
- `complex_schools`: `kind, distance_m, is_assigned`. 학교급별 3 km 안 가까운 3곳 + 배정 초등학교. `is_assigned=true`가 `complexes.elementary_school`과 같은 학교다.

## 어린이집·유치원 `childcare_facilities` (PK `id`), `complex_childcare` (PK `kapt_code, facility_id`)

- `childcare_facilities`: `id`(`cc:…`, `kg:…`), `kind`('daycare'|'kindergarten'), `name, type_name`(원문), `type_code`('public'|'welfare'|'corporate'|'private'|'home'|'cooperative'|'workplace'|'other'), `status, sido, sigungu, address, capacity, current_children, latitude, longitude, updated_at`
- `complex_childcare`: `kind, type_code, distance_m`. 종류별 1 km 안 가까운 10곳, 없으면 2 km 안 가장 가까운 1곳.
- 어린이집 출처는 어린이집정보공개포털 '어린이집 기본정보'(매월 말일 기준)다. 포털의 이용 조건은 "저작자와 출처를 표시하면 비영리목적의 변경 및 자유이용 허락"이다. 사용자 결정(2026-11-06): 출처를 표시해 쓴다. 화면에 "출처: 어린이집정보공개포털, 2026. 10."처럼 기준 월과 함께 적는다. 유료 기능에 넣게 되면 비영리 조건을 다시 확인한다. `id`는 자료에 코드가 없어 지역·이름·인가일·주소로 만든 값이라, 주소가 바뀌면 달라질 수 있다.

## 동·타입 `complex_buildings` (PK `kapt_code, register_pk`), `complex_dong_types` (PK `kapt_code, dong_name, exclusive_area`)

- `complex_buildings` (표제부, 주건축물 중 공동주택): `dong_name`(없으면 null), `building_name, pnu, main_purpose, ground_floors, basement_floors, households, height_m, elevators, structure, approved_on, updated_at`
- `complex_dong_types` (전유부): `dong_name`(없으면 ''), `exclusive_area`(㎡), `households`, `source_month`. `complex_area_types.exclusive_area`와 이어 공급면적·평형을 얻는다.

## 버스 `bus_stops` (PK `id`), `complex_bus_stops` (PK `kapt_code, stop_id`)

- `bus_stops`: `name, latitude, longitude, sido, city, ars_no, source`('tago'|'seoul'), `is_express`, `express_routes`(노선 번호 배열), `updated_at`
- `complex_bus_stops`: `distance_m, is_express`. 500 m 안 가까운 10곳 + 1 km 안 광역 정류장 3곳.
- `is_express = null`이면 노선 자료를 아직 못 받은 것이다. '광역버스 없음'으로 읽으면 안 된다. 광역 판단은 TAGO 노선 유형(광역·직행좌석)이며, 서울시 등록 광역 노선(예: 서울 9xxx)만 다니는 정류장은 빠질 수 있다.

## 곧 나올 전세 `market_rent_expiries` (PK `place_id, area_type, end_month`)

`kapt_code`(없을 수 있음), `area_type`(`market_rents.area_type`과 같음), `end_month`('2027-03'), `contracts, jeonse, monthly, renewed, jeonse_median_deposit`(만원), `last_deal_date, computed_at`

- 아파트만, 최근 36개월 신고 중 만기가 지난달 이후인 계약. 해제 건은 뺀다.
- 신고에 호 정보가 없어 **'몇 건 만기 예정'의 상한**이다. 만기 전에 갱신 신고가 들어와도 옛 계약이 그대로 남는다.
- `market_rents`에는 계약 기간 열을 넣지 않았다. 12개월치뿐이라 만기 예측에 모자라고, 106만 줄을 다시 써야 한다.

## 공시가격 (기존 표) `complex_official_prices`

`area_type = floor(전용면적)`으로 잇는다. 없는 단지·타입은 보유세를 어림으로 표시한다.
