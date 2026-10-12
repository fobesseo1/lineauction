# Supabase 보안 점검 경고: 의도된 설계 기록

확인일: 2026-10-12. Supabase 보안 점검(Advisors)에서 반복해서 나오는 경고 중, 의도된 것과 그 이유를 적는다.

## 1. RLS는 켜져 있지만 정책이 없는 테이블

| 테이블 | 내용 | 공개 키(anon·authenticated) 읽기 |
|---|---|---|
| `app_settings` | 수집 설정·가중치 | 불가 |
| `collection_runs` | 수집 실행 기록 | 불가 |
| `court_observations` | 법원 관측 기록 (원본은 PC에만) | 불가 |
| `onbid_observations` | 온비드 표시용 항목 | 불가 |

정책이 없으면 RLS가 모든 행을 막는다. 수집기는 service role로 RLS를 우회해 읽고 쓴다. 즉 **"서버 전용"이라는 뜻**이고, 공개 키에는 테이블 권한도 없다(`has_table_privilege` = false). 의도된 설계다.

## 2. `public.onbid_public_detail(uuid)`: anon이 실행할 수 있는 SECURITY DEFINER 함수

- `onbid_observations`는 서버 전용이다. 공개 사이트에는 그중 **표시용 12개 항목과 공식 사진·문서 링크만** 보여줘야 한다.
- 이 함수가 그 화이트리스트만 `jsonb`로 돌려준다. `search_path = ''`로 고정했고, 입력은 물건 id 하나다.
- 정의: `supabase/migrations/20261010130000_onbid_public_detail_function.sql`
- 의도된 설계다. 반환 항목을 늘릴 때는 그 항목이 공개해도 되는지 먼저 확인한다.

## 3. 서비스 테이블

lineestate의 회원·관심·알림 테이블은 `app` 스키마에 있고, lineestate 저장소가 관리한다. `public.lineestate_*`는 자매사이트(realestate-sanbon)의 것이다.
