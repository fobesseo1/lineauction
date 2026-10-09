# Supabase 연결 기록

2026-10-06 Supabase MCP를 통해 사용자가 지정한 조직에 전용 프로젝트를 생성했습니다.

- 조직: fobesseo1's Org
- 프로젝트: auction-deal-finder
- 프로젝트 ref: ravnmmskkcoojkdipizz
- 지역: 서울 (ap-northeast-2)
- 생성 시 안내 비용: 월 $0 / Free 조직
- [프로젝트 대시보드](https://supabase.com/dashboard/project/ravnmmskkcoojkdipizz)
- URL과 활성 publishable 키를 로컬 `.env.local`에 저장했습니다. 키 값은 이 문서에 기록하지 않습니다.

## 적용 결과

초기 migration `20261006120402_initial_schema.sql` 및 `supabase/seed.sql` 적용 완료. 로컬 파일명도 원격 migration history의 실제 버전에 맞췄습니다.

properties, property_price_history, transactions, property_analysis, notifications, user_filters, app_settings의 7개 테이블 모두 RLS 활성화. 금액 문자열 변환 뷰 2개는 security_invoker를 사용합니다. upsert RPC는 서비스 역할만 실행할 수 있습니다. 공개 역할은 app_settings를 조회할 수 없습니다. 기본 설정은 1행이며 가상 물건은 원격 DB에 저장하지 않았습니다.

## 검증

- 실제 publishable 키로 properties_public 및 property_history_public REST 조회: HTTP 200, 0건
- 같은 공개 키로 app_settings 조회: HTTP 401, 접근 차단
- anon 역할로 공개 뷰 SQL 조회: 성공
- SQL 권한 검사: anon의 설정 조회 및 upsert 호출 불가, service_role upsert 호출 가능
- 실제 앱 `/dashboard?demo=0`: DB 연결 성공, 수집 전 빈 목록 표시. 로컬 개발 서버도 Supabase에 접근할 수 있도록 다시 실행했습니다.
- Security Advisor: ERROR/WARN 없음. app_settings의 정책 부재 INFO 1건은 공개·사용자 역할을 모두 차단하고 service_role만 사용하는 의도적 구성입니다. [해당 점검 항목](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- Performance Advisor: 데이터 수집 전 미사용 인덱스 INFO만 있습니다. 외래키와 RLS 사용자 열의 인덱스도 생성했습니다.

## API 키 검증 (2026-10-06)

사용자가 입력한 ONBID_API_KEY와 SUPABASE_SECRET_KEY의 실제 연결을 확인했습니다. Supabase 서버 키로 비공개 app_settings 조회 성공 (1행), 온비드 목록 API는 HTTP 200/resultCode 00으로 2건 반환, 앱 어댑터에서도 2건 검증·변환 성공/거절 0건입니다. 키 값이나 원본 응답은 이 기록에 저장하지 않습니다. 검증은 조회만 수행하며 공매물건을 DB에 저장하지 않았습니다. 일회성 실연결 테스트는 실행 후 삭제해 일반 테스트에서 API 키가 필요하지 않도록 유지했습니다.

MOLIT_API_KEY도 실제 조회 검증을 완료했습니다. 아파트 매매 API에 강남구(LAWD_CD=11680), 2026년 9월(DEAL_YMD=202609), 2건을 요청하여 HTTP 200/resultCode 000, 조회 2건/전체 75건을 확인했습니다. 공식 명세는 docs/sources/molit-apartment.swagger.json에 보관했습니다. 검증 결과는 DB에 저장하지 않았으며 화면의 실거래 비교와 국토부 수집·분석은 후속 구현 단계입니다.

공매 수집용 키와 아파트 매매 실거래 조회 키는 설정됐고 CRON_SECRET도 로컬에 저장되어 있습니다. 다른 부동산 유형의 실거래 비교에는 해당 유형 API의 별도 활용신청이 필요합니다. Telegram 알림을 쓸 경우 TELEGRAM_BOT_TOKEN과 TELEGRAM_CHAT_ID가 필요하며 전송 기능은 후속 구현 단계입니다.

사용자가 추가 활용신청한 5개 매매 API도 같은 MOLIT_API_KEY로 검증했습니다. 모두 HTTP 200/resultCode 000/OK입니다. 강남구(11680), 2026년 9월(202609), 최대 2건 조회 기준:

| 유형 | 반환 건수 | 전체 건수 |
| --- | ---: | ---: |
| 오피스텔 | 2 | 45 |
| 상업업무용 | 2 | 51 |
| 토지 | 2 | 175 |
| 연립다세대 | 2 | 48 |
| 단독/다가구 | 1 | 1 |

각 서비스의 공식 Swagger 명세는 docs/sources/molit-*.swagger.json에 저장했습니다. 키와 실제 거래 원본은 저장하지 않았으며, 검증 호출은 DB를 변경하지 않았습니다. 이제 6개 유형 모두 조회 권한이 확인됐으며 별도 유형별 키 환경변수는 필요하지 않습니다. 실제 수집과 화면 연결은 후속 구현 단계입니다.

현재 DEMO_MODE=true를 유지합니다. `/dashboard?demo=0`에서 실제 연결 화면을 볼 수 있습니다. 운영 전환 시 DEMO_MODE=false로 변경합니다.
