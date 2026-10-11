# 나중에 할 일

## ⭐ AI 검색·인용 대응 (최우선, 2026-10-11 결정)

기본 세팅(새 서비스 생성·간편로그인·중개사 인증·관심 알림)이 끝나면 바로 착수한다. 결제는 기다리지 않는다.

새 서비스는 별도 저장소 `C:\Users\hjdh5\Desktop\lineestate`에서 만든다. 이 저장소는 **데이터 공장**(수집기, 공공 API 키, `public` 스키마의 수집 데이터 테이블)으로 남는다. 서비스용 테이블(회원, 관심, 알림 등)은 lineestate가 `app` 스키마에서 직접 관리한다.
- 기능 정의서: `lineestate/docs/product-spec.md`
- AI 계획: `lineestate/docs/ai-discoverability.md`

## 온비드 공매에 인천 추가 (2026-10-11 결정, 보류)

법원 경매·국토부 실거래·공개 사이트는 2026-10-11부터 수도권(서울·경기·인천)으로 넓혔다. 온비드 공매는 밀린 상세(서울·경기 약 6,900개, 하루 1,000건)를 먼저 끝낸 뒤 인천을 추가하기로 했다.

추가할 때 바꿀 곳:
- `scripts/onbid/core.mjs` `scope`: `lctnSdnm`에 `인천광역시` 추가.
- `scripts/onbid/core.mjs` `partitionList()`: 목록 API 지역 구간에 인천 추가(구간당 하루 요청이 늘어남, 현재 목록 약 276회/1,000).
- `scripts/onbid/lifecycle-sync.mjs`: DB 조회 `sido` 목록에 `인천광역시` 추가. 추가 첫날 인천 물건은 DB에 없으므로 미관측 처리 대상이 아니다.
- `components/onbid-monitor.tsx`: "서울·경기" 문구.
- 추가 직후 인천 상세가 밀린 상세 대기열에 합쳐진다(마감 임박 순).

## 온비드 실행 요일 조정

밀린 상세가 끝나면("상세 수집이 모두 끝났습니다" 알림) `scripts/daily/core.mjs`의 `RUN_DAYS.onbid`를 평일로 바꿀지 결정한다. 작업 스케줄러 `\LineAuction\Onbid Daily 10am` 트리거도 함께 바꾼다.
