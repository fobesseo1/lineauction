# 선경매 · LINE AUCTION

공개 조회: **https://fobesseo1.github.io/lineauction/** — 서울·경기 경매물건 검색, 사진·입찰 조건·국토부 실거래 비교를 휴대폰과 PC에서 볼 수 있습니다. 수집은 로컬 PC에서 계속 실행하며 공개 사이트는 DB 읽기만 수행합니다. 사진은 배포 시점까지 포함됩니다. [GitHub Pages 게시 안내](docs/setup/github-pages.md)

Next.js App Router + TypeScript strict + Tailwind CSS v4 + shadcn/ui + Supabase PostgreSQL + Zod.

현재 요청서 19번의 초기 구현 범위(Phase 1–2)를 제공합니다. 대시보드·검색·상세·설정 UI도 함께 구성했습니다. **전체 투자분석 MVP가 완료된 상태는 아닙니다.** Supabase 전용 프로젝트 생성과 초기 DB 적용·공개 REST 조회·접근 권한 검증을 완료했습니다. 입력된 서버 키로 비공개 설정 조회, 온비드 실제 응답 2건의 검증·변환도 성공했습니다. 전체 수집 작업의 실행·운영 검증은 별도 단계입니다. [연결 기록](docs/setup/supabase.md)

## 실행

Node.js 24 LTS와 npm을 사용합니다.

```powershell
npm ci
Copy-Item .env.example .env.local
# .env.local에 본인의 키를 입력
npm run dev
```

http://localhost:3000 에서 대시보드를 확인합니다. **API·Supabase 설정 없이 가상 데이터 데모가 자동으로 열립니다.** 가상 물건 8건, AI 생성 이미지 3종, 샘플 시장가·할인율·점수·거래·변경이력으로 화면을 둘러볼 수 있습니다. 화면에 데모와 가상 데이터 표시를 제공합니다. 데이터는 메모리에서만 읽으며 DB와 수집 작업에 저장하지 않습니다.

`/dashboard?demo=1`은 데모, `/dashboard?demo=0`은 실제 데이터 화면입니다. Supabase 연결 후 기본 화면은 실제 데이터로 전환됩니다. 환경변수 `DEMO_MODE=true`로 데모를 유지하거나 `false`로 끌 수 있습니다. 실제 DB 오류가 발생한 경우 가상 데이터로 숨기지 않습니다.

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
```

검증은 API fixture/키 인코딩/큰 정수/XML/비공개 금액/잘못된 날짜/재시도/부분실패/페이지 제한/Cron 인증 및 PostgreSQL 실행을 포함합니다. DB 테스트는 PGlite의 메모리 PostgreSQL 엔진에서 migration과 RPC를 실제 실행합니다. 이는 테스트 전용이며 운영 DB는 Supabase입니다. 운영 Supabase에서의 네트워크·권한·성능 검증을 대체하지 않습니다.

## Supabase 설정

1. Supabase 프로젝트를 생성합니다.
2. SQL Editor에서 `supabase/migrations/20261006120402_initial_schema.sql`을 실행합니다.
3. `supabase/seed.sql`을 실행해 기본 가중치·수집 설정을 생성합니다. 실제 공매물건은 seed에 넣지 않습니다.
4. `.env.local`에 URL, anon key, service role key를 입력합니다.
5. 대시보드에서 연결 상태를 확인하고 수집을 실행합니다.

현재 `auction-deal-finder` 프로젝트에는 위 초기 migration과 seed가 적용되어 있으므로 다시 실행할 필요가 없습니다. 로컬 `.env.local`에는 URL과 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`가 저장되어 있습니다. 서버 수집에는 `SUPABASE_SECRET_KEY`가 추가로 필요합니다. 기존 `NEXT_PUBLIC_SUPABASE_ANON_KEY`와 `SUPABASE_SERVICE_ROLE_KEY`도 호환되며 새 키가 우선됩니다. 디자인 확인을 위해 현재 `DEMO_MODE=true`를 유지했습니다. 실제 DB 화면은 `/dashboard?demo=0`에서 확인합니다.

기존 Supabase 프로젝트를 사용할 경우 테이블 이름 충돌을 먼저 확인하세요. 이 migration은 새 프로젝트용입니다. 향후 Supabase CLI 연결 후 `supabase db push`로 관리할 수 있습니다. CLI 실행/원격 DB 적용은 이번 작업에서 수행하지 않았습니다.

브라우저 공개 변수는 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`와 호환용 `NEXT_PUBLIC_SUPABASE_ANON_KEY`뿐입니다. secret/service role, 온비드·국토부·Telegram·Cron 키는 서버 전용이며 `server-only` 경계로 보호됩니다. `.env.local`은 Git에서 제외됩니다.

### 데이터 모델과 보안

- properties / property_price_history / transactions / property_analysis / notifications / user_filters / app_settings
- 물건은 `(source, source_property_id, auction_condition_id)`로 구분합니다. 동일 관리번호에 복수 공매조건이 존재할 수 있으므로 두 필드만으로 덮어쓰지 않습니다.
- 금액은 DB `numeric(30,0)`, 도메인에서는 원 단위 문자열, 계산은 `BigInt`를 사용합니다. 공개 조회 view는 금액을 text로 반환합니다.
- 원본 JSON 숫자를 lossless-json으로 문자열로 읽어 JS 안전 정수 범위를 넘는 금액도 보존합니다.
- 날짜는 timestamptz로 저장하고 Asia/Seoul로 표시합니다. 국토부 거래일 테이블은 날짜만 의미하므로 date입니다.
- upsert RPC는 advisory transaction lock을 사용하며 물건 수정과 history 저장을 한 트랜잭션에 포함합니다.
- 최초 수집에 초기 snapshot을 저장합니다. 가격, 감정가, 상태, 유찰, 차수·회차, 입찰 일정이 바뀌면 history를 추가합니다. 변동 없는 확인은 last_seen_at만 갱신합니다. 늦게 도착한 과거 snapshot은 거절합니다.
- 모든 테이블 RLS 활성화. 공매 데이터는 공개 읽기만 허용하고, 데이터 쓰기는 service role만 수행합니다. 개인 필터는 auth.uid() 소유자만 접근 가능합니다. notifications는 소유자 읽기만 가능하며 app_settings에는 공개 접근 권한이 없습니다.
- 공개 읽기 정책은 개인용 MVP의 공개 공매 데이터 정책입니다. 로그인 전용 서비스로 전환할 때 읽기 정책도 함께 변경해야 합니다.
- Auth browser/server client 구조를 준비했으며 실제 로그인 UI·세션 refresh proxy는 후속 작업입니다.

## 온비드 API — 공식 문서 기준

공식 출처: [한국자산관리공사 차세대 온비드 부동산 물건목록 조회서비스](https://www.data.go.kr/data/15157207/openapi.do)

2026-10-06에 공식 페이지의 내장 Swagger를 확인하고 `docs/sources/onbid-list.swagger.json`에 보관했습니다. 요청 필드 설명은 같은 snapshot의 `swaggerOprtinVOs.reqList`에 있습니다.

구현하는 공개 게이트웨이:

```text
https://apis.data.go.kr/B010003/OnbidRlstListSrvc2/getRlstCltrList2
```

Swagger 최상위 host/path는 위 게이트웨이를 가리킵니다. 같은 문서의 내부 `oprtinUrl`에는 기관 upstream 주소(`open.kamco.or.kr/services/OnbidRlstListSrvc/getRlstCltrList`)가 별도로 들어 있습니다. 둘을 혼합하지 않고 공개 게이트웨이를 사용합니다. 실제 승인 키로 gateway 계약을 최종 확인해야 합니다.

요청: serviceKey, pageNo, numOfRows, resultType=json, prptDivCd, dspsMthodCd, bidDivCd, pvctTrgtYn. 설명 본문과 reqList에서 pvctTrgtYn 필수 여부가 다르므로 항상 전송합니다. 인증키는 **디코딩된 일반 인증키**를 환경변수에 입력합니다. URLSearchParams가 한 번 인코딩합니다.

주요 응답 매핑:

| 공식 필드 | 내부 필드 |
| --- | --- |
| cltrMngNo | source_property_id |
| pbctCdtnNo | auction_condition_id |
| onbidPbancNo | notice_id |
| onbidCltrNm | title |
| prptDivNm | asset_type |
| cltrUsgSclsCtgrNm / cltrUsgMclsCtgrNm | usage_type |
| lctnSdnm / lctnSggnm / lctnEmdNm | sido / sigungu / dong |
| apslEvlAmt | appraisal_price |
| lowstBidPrcIndctCont | minimum_bid_price |
| usbdNft | failed_bid_count |
| pbctsn / pbctNsq | auction_round / auction_sequence |
| cltrBidBgngDt / cltrBidEndDt | bid_start_at / bid_end_at |
| pbctStatNm / pbctStatCd | status / status_code |
| dspsMthodNm / dspsMthodCd | disposal_method / disposal_code |
| batcBidYn | bulk_bid |
| landSqms / bldSqms | land_area / building_area |
| ltnoPnu / mdfcnDt | pnu / source_updated_at |

공식 목록에서 확인되지 않은 상세 지번·도로명주소, 좌표, 단지명, 전용면적은 추측하지 않고 null로 남깁니다. 건물면적을 아파트 전용면적으로 취급하지 않습니다. 별도의 부동산 상세 API를 확인한 뒤 `fetchPropertyDetail`을 구현해야 합니다(현재 명시적 미구현 오류).

금액 비공개는 null입니다. malformed 값은 임의의 0으로 바꾸지 않고 해당 row 실패로 계산합니다. JSON/XML, 단일 item/배열 item, 빈 items를 처리합니다. fixture는 문서 필드명으로 만든 **합성 테스트 자료**이며 실제 응답 녹화본이 아닙니다. 실제 성공코드·빈 응답·데이터 타입 호환성은 승인 키로 최종 확인해야 합니다.

### 수집 실행

공공데이터포털에서 해당 API 활용신청 승인을 받고 키를 `.env.local`에 넣습니다. 기본 대상은 압류재산(0007), 매각(0001), 인터넷 입찰(0001), 수의계약 불가(N)입니다. 전체 재산 유형을 수집하려면 `.env.example`의 ONBID_* 범위를 변경합니다.

```powershell
# 비밀키가 터미널 출력/저장 로그에 남지 않도록 안전하게 변수로 읽습니다.
$cronValue = Read-Host 'CRON_SECRET 입력' -MaskInput
Invoke-RestMethod -Uri 'http://localhost:3000/api/cron/collect-onbid' -Method Post -Headers @{ Authorization = "Bearer $cronValue" }
```

401: 인증실패 / 200: 해당 범위 전체 페이지 수집 성공 / 503: 설정 오류, 페이지 제한 또는 일부 실패. 응답은 created/updated/unchanged/stale/failed/pages/complete 카운터입니다. 원본 에러 메시지·API URL·키는 응답이나 로그에 노출하지 않습니다.

외부 요청 timeout 20초, 최대 3회 재시도, 지수 backoff. 인증 오류·일일 quota 초과는 즉시 중단하고 일시적 서버 오류/초당 제한만 재시도합니다. 페이지 간 최소 1초 간격을 적용합니다. row/DB 실패는 다른 row 처리를 막지 않습니다. 기본 최대 10페이지·페이지당 100건이며 제한에 도달하면 complete=false입니다. API 일일 quota(포털 기본 개발계정 1,000회)와 실행 시간에 맞춰 조정해야 합니다. 100건 요청 허용 여부는 실제 키로 확인하고 필요하면 page size를 낮추세요.

중복/동시 수집 시 DB 일관성은 유지되지만 불필요한 API 호출량까지 막지는 않습니다. 대규모 운영에서는 job lease와 checkpoint가 필요합니다. 목록에서 사라졌다는 이유만으로 종료 처리하지 않습니다. 수집 실패나 범위 제한을 종료로 오판할 수 있기 때문입니다.

## 스케줄링

`vercel.json`은 매시간 수집 endpoint를 호출합니다. Vercel 프로젝트의 `CRON_SECRET`과 앱 설정을 일치시키세요. Vercel이 Authorization Bearer 헤더를 전송합니다.

[공식 Vercel Cron 요금·제한](https://vercel.com/docs/cron-jobs/usage-and-pricing)에 따르면 Hobby는 하루 한 번만 허용하므로 현재 매시간 설정은 Pro 이상이 필요합니다. Hobby에서는 cron 항목을 제거하고 Supabase Cron 또는 GitHub Actions로 인증된 endpoint를 호출할 수 있습니다. 배포·스케줄 활성화는 이번 작업에서 하지 않았습니다. 현재 cron은 collect-onbid만 실행합니다. 실거래 수집·분석·알림 job은 아직 연결하지 않았습니다.

## UI와 디자인

제공된 `DESIGNstyle-lineestate.md`를 `docs/design/`에 원본 보관했습니다. 현재 브랜드는 선경매 · LINE AUCTION이며 새 로고는 `public/brand/lineauction-logo.svg`에 원본 그대로 저장하고 공통 헤더에서 사용합니다. 이전 로고는 원본 기록으로 보관합니다.

Tailwind v4 색상 토큰과 shadcn/ui Card/Button/Badge/Input/Select/Table/Separator를 사용합니다. #f7f7f7 캔버스, 흰 카드, #222222 텍스트·기본 버튼, #6a6a6a 보조 텍스트, 12px 카드, pill 검색바, 코랄 검색 버튼을 적용했습니다. SVG 자체의 색상은 유지합니다. **전체 텍스트·입력·팝오버는 Pretendard Variable, 자간 -0.5% (`-0.005em`)**를 사용합니다. 폰트와 OFL 라이선스는 `public/fonts/`에 저장해 외부 CDN 없이 제공합니다. AI 이미지는 가상 물건에만 사용합니다. 생성 프롬프트·이미지 경로·폰트 출처는 [에셋 기록](docs/design/asset-ledger.md)을 확인하세요.

- /dashboard: 수집 상태, 조회 범위 통계, 최근 물건, 검색
- /properties: 지역·용도·입찰가격·유찰 필터, 최근등록·최저가·마감 정렬, 데모 점수·할인율 정렬
- /properties/[id]: 기본정보, 감정가 대비율, 변경이력, 데모 사진·가격 비교·거래 표·점수 근거
- /settings: 연결 준비 상태와 설치 안내 (키 값은 표시하지 않음)

실제 데이터의 초기 목록은 최근 확인 200건으로 제한되어 있으며 검색과 통계도 이 범위에 한정됩니다. 전체 데이터 검색·통계는 서버 pagination/집계로 확장할 예정입니다. 실제 데이터의 시장가격/할인율/S·A 점수 산정은 후속 구현이며 데모 분석은 화면 확인용 예시입니다.

## 후속 작업

- Phase 2 후속: 상세 endpoint/정확한 전체주소·전용면적 확인, 승인 키로 실수집 검증
- Phase 3: 국토부 아파트/오피스텔/상업업무/토지 API 공식 계약 확인, 법정동 지역코드와 취소거래 처리, 실거래 저장
- Phase 4: 동일 단지·면적 ±5%, ±10%, 동일 법정동, 인근 지역 매칭과 3/6/12개월 중앙값, 설정 기반 급매점수
- Phase 5 확장: 시장가·등급·점수·면적·입찰마감 상세 필터, 전체 데이터 pagination, 비교 거래·점수 근거
- Phase 6: Telegram 전송 및 recipient+property+type+payload_hash 중복 방지/outbox 재시도
- Phase 7 확장: 실거래/분석/알림 독립 job, 실행 기록·lease·증분 checkpoint
- 다중 사용자: Supabase Auth 세션 갱신, 관심물건/사용자 알림 설정
- CourtAuctionSource: 공식 데이터 접근 확인 전 구현하지 않음

초기 npm audit에서 개발 도구인 eslint-config-next → fast-glob → micromatch → braces 경로에 high advisory가 보고됩니다. 설치 당시 braces 최신 3.0.3에도 수정 버전이 없었으며, audit의 Next 14 downgrade 제안은 적용하지 않았습니다. 런타임 의존성은 `npm audit --omit=dev`로 별도 확인할 수 있습니다. upstream 패치가 나오면 갱신하세요.
