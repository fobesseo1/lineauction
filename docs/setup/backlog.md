# 나중에 할 일

## ⭐ AI 검색·인용 대응 (최우선, 2026-10-11 결정)

기본 세팅(새 서비스 생성·간편로그인·중개사 인증·관심 알림)이 끝나면 바로 착수한다. 결제는 기다리지 않는다.

새 서비스는 별도 저장소 `C:\Users\hjdh5\Desktop\lineestate`에서 만든다. 이 저장소는 **데이터 공장**(수집기, 공공 API 키, `public` 스키마의 수집 데이터 테이블)으로 남는다. 서비스용 테이블(회원, 관심, 알림 등)은 lineestate가 `app` 스키마에서 직접 관리한다.
- 기능 정의서: `lineestate/docs/product-spec.md`
- AI 계획: `lineestate/docs/ai-discoverability.md`

## ⭐ 정식 오픈 전: 매일 수집을 밤으로 (중요, 2026-10-30 결정)

오픈 전까지는 지금 시간(9시·10시·법원 이어서) 그대로 둔다. 전체 오픈 점검표는 `lineestate/docs/product-spec-v3.md` 10장.
- **오픈 전 시험**: 하룻밤 00:30 시작으로 돌려 법원 사이트 새벽 점검 여부, 걸린 시간, 실패를 확인한다.
- **사용자가 들어오면 전환**: `scripts/daily/core.mjs`의 `SCHEDULE_HOURS`(분 단위 지원 필요)와 `RUN_DAYS.court`(평일 → 화~토), `watch-core.mjs`의 `SCHEDULE`, `status.mjs` 시간 문구, 작업 스케줄러 트리거를 함께 바꾼다. 알림(`alerts` 단계)은 밤에는 보내지 않고 오전 9시에 모아 보낸다.
- 전제: 수집기 서버 이전(Oracle 무료 먼저). PC가 밤에 꺼져 있으면 켤 때 돌아서 효과가 없다.
- 텔레그램 봇(`bot.mjs`)은 Vercel 웹훅으로 옮긴다. 연결 코드가 10분이면 만료돼 PC가 꺼져 있으면 연결이 안 된다.
- 대량 재업로드·복구는 사용자 시간대를 피한다. `publish.mjs`는 반드시 `--with-villas` (빠뜨리면 빌라 건물과 딸린 통계·실거래가 연쇄 삭제된다, 2026-10-30 사고).

## 텔레그램 알림 발송 — 완료 (2026-10-13)

봇 @line_estate_alert_bot. `scripts/alerts/send.mjs`가 온비드·법원·단지 작업 끝에 돌고, `scripts/alerts/bot.mjs`가 1분마다(`\LineAuction\Telegram Bot every 1min`) `/start 코드`·`/stop`을 처리한다. 보낸 기록은 `data/alerts/state.json`(지우면 다음 실행은 조용히 다시 기록만 함). 새로 저장한 조건은 첫 실행에 "지금 N건" 한 줄만 보내고, 이후 새로 맞는 물건(최저가가 바뀌면 다시)을 보낸다.

## 온비드 실행 요일 조정

밀린 상세가 끝나면("상세 수집이 모두 끝났습니다" 알림) `scripts/daily/core.mjs`의 `RUN_DAYS.onbid`를 평일로 바꿀지 결정한다. 작업 스케줄러 `\LineAuction\Onbid Daily 10am` 트리거도 함께 바꾼다.
