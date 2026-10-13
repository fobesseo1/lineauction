# 나중에 할 일

## ⭐ AI 검색·인용 대응 (최우선, 2026-10-11 결정)

기본 세팅(새 서비스 생성·간편로그인·중개사 인증·관심 알림)이 끝나면 바로 착수한다. 결제는 기다리지 않는다.

새 서비스는 별도 저장소 `C:\Users\hjdh5\Desktop\lineestate`에서 만든다. 이 저장소는 **데이터 공장**(수집기, 공공 API 키, `public` 스키마의 수집 데이터 테이블)으로 남는다. 서비스용 테이블(회원, 관심, 알림 등)은 lineestate가 `app` 스키마에서 직접 관리한다.
- 기능 정의서: `lineestate/docs/product-spec.md`
- AI 계획: `lineestate/docs/ai-discoverability.md`

## 텔레그램 알림 발송 — 완료 (2026-10-13)

봇 @line_estate_alert_bot. `scripts/alerts/send.mjs`가 온비드·법원·단지 작업 끝에 돌고, `scripts/alerts/bot.mjs`가 1분마다(`\LineAuction\Telegram Bot every 1min`) `/start 코드`·`/stop`을 처리한다. 보낸 기록은 `data/alerts/state.json`(지우면 다음 실행은 조용히 다시 기록만 함). 새로 저장한 조건은 첫 실행에 "지금 N건" 한 줄만 보내고, 이후 새로 맞는 물건(최저가가 바뀌면 다시)을 보낸다.

## 온비드 실행 요일 조정

밀린 상세가 끝나면("상세 수집이 모두 끝났습니다" 알림) `scripts/daily/core.mjs`의 `RUN_DAYS.onbid`를 평일로 바꿀지 결정한다. 작업 스케줄러 `\LineAuction\Onbid Daily 10am` 트리거도 함께 바꾼다.
