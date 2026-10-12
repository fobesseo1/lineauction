# 나중에 할 일

## ⭐ AI 검색·인용 대응 (최우선, 2026-10-11 결정)

기본 세팅(새 서비스 생성·간편로그인·중개사 인증·관심 알림)이 끝나면 바로 착수한다. 결제는 기다리지 않는다.

새 서비스는 별도 저장소 `C:\Users\hjdh5\Desktop\lineestate`에서 만든다. 이 저장소는 **데이터 공장**(수집기, 공공 API 키, `public` 스키마의 수집 데이터 테이블)으로 남는다. 서비스용 테이블(회원, 관심, 알림 등)은 lineestate가 `app` 스키마에서 직접 관리한다.
- 기능 정의서: `lineestate/docs/product-spec.md`
- AI 계획: `lineestate/docs/ai-discoverability.md`

## 텔레그램 알림 발송 (봇 준비되면)

lineestate의 ··를 service role로 읽어 보낸다. 규칙(lineestate/docs/data-factory-requests.md 참고):
- 대상은 만.
-  조건은 로 판단하되, 가 이거나 이면 만족하지 않는 것으로 본다.
- 상가·건물·토지 참고 시세(가 , , , 로 시작)는 할인율 알림에서 제외한다.
- 봇 로 chat id 연결, 으로 해제.

## 온비드 실행 요일 조정

밀린 상세가 끝나면("상세 수집이 모두 끝났습니다" 알림) `scripts/daily/core.mjs`의 `RUN_DAYS.onbid`를 평일로 바꿀지 결정한다. 작업 스케줄러 `\LineAuction\Onbid Daily 10am` 트리거도 함께 바꾼다.
