# 사이트 속도 개선 결과 — 2026-10-10

## 변경 내용

실제 자료 화면의 대시보드와 찾기를 전체 물건 내려받기에서 24건 단위 조회로 바꿨다. 검색, 출처, 지역, 용도, 상태, 가격, 유찰 횟수, 정렬은 DB에서 처리한다. 더 보기는 다음 24건을 추가한다. 목록은 카드에 필요한 필드만 읽고 전체 건수는 DB count로 구한다. 서버 목록 캐시는 180초이며 같은 조회의 동시 요청을 합친다.

카드에서 상세 페이지 자동 미리 가져오기를 껐다. 공개 사이트에도 같은 목록 쿼리를 적용했다. 약 2MB의 전체 사진 존재 목록을 초기 JavaScript에 넣던 부분을 없애고, 상세 컴포넌트와 지도 자료는 상세 화면에서 읽도록 바꿨다. 공개 사진은 카드 로딩 실패 표시와 상세 사진별 존재 확인을 사용한다.

실제 수집 API를 호출하거나 수집기를 중지·재시작하지 않았다. `scripts/court/`, `data/court/`는 수정하지 않았다. DB 스키마와 RLS 변경, 커밋, 푸시, 배포도 하지 않았다.

## 측정

이전 수치는 작업 지시서에 기록된 측정값이다. 아래의 새 목록 수치는 실제 익명 DB 읽기와 오프라인 컴포넌트 렌더 결과로, 전체 HTTP 페이지 응답이나 브라우저 표시 시간과는 다르다.

| 이전 측정 항목 | 값 |
|---|---:|
| 대시보드 전체 HTML | 9.5MB |
| 대시보드 캐시 없는 응답 | 8~9초 |
| 찾기 전체 HTML | 21.5MB |
| 찾기 응답 | 1.7초 |

| 새 조회 | 행 수 | 목록 JSON | 목록 컴포넌트 HTML | DB 조회 시간 |
|---|---:|---:|---:|---:|
| 법원 첫 페이지 | 24 | 19,462B | 143,515B | 933ms |
| 온비드 첫 페이지 | 24 | 14,046B | 102,078B | 254ms |
| 사건번호 검색 | 1 | 798B | 11,141B | 320ms |
| 법원 가격순 | 24 | 17,936B | 143,112B | 915ms |
| 법원 다음 페이지 | 24 | 18,432B | 143,673B | 381ms |

온비드 JSON 측정은 공통 DB 쿼리 결과이며, 로컬 서버에서 보완하는 공식 대표 사진 URL은 포함하지 않는다. 측정 당시 법원 조회 count는 6,383건, 온비드는 입찰 조건별 26,949건이다. count를 중복 제거한 물건 수로 해석하면 안 된다.

| 같은 빌드 산출물 비교 | 이전 | 이후 |
|---|---:|---:|
| 공개 사이트 초기 앱 JavaScript | 2,090,827B | 28,658B |

초기 앱 JavaScript는 약 98.6% 줄었다. 공통 런타임이나 필요할 때 받는 상세 청크까지 모두 포함한 총 다운로드 크기는 아니다. 공개 사이트 정적 초기 HTML은 12,153B이다. 원본 측정은 `docs/qa/catalog-performance.json`에 있다.

## 검증 결과와 남은 확인

- `npm run lint`: 통과. 오류 0개, 기존 경고 7개.
- `npm run typecheck`: 통과.
- `npm run test`: 44개 통과, 실제 DB 측정 테스트 1개는 기본 실행에서 제외.
- 실제 DB 측정 테스트: 별도 실행 통과. 24건 제한, 사건번호 검색, 가격순, 다음 페이지와 작은 렌더 크기 확인.
- 프로덕션 빌드: `SITE_PERFORMANCE_BUILD=1`로 실행해 통과. 실행 중인 개발 서버의 `.next`와 분리한 `.next-performance`에 생성.
- `npm run build:pages`: 통과. 공개 앱 TypeScript 검사 포함.
- `node scripts/check-pages.mjs --static`: 산출물 검사 통과.
- `node scripts/check-public-secrets.mjs`: 통과. 비공개 인증정보 검출 0개.

**브라우저 검증은 완료하지 못했다.** 앞선 세션에서 로컬 주소에 대한 브라우저 URL 정책 거부가 기록되어 있어 다른 브라우저나 HTTP 도구로 우회하지 않았다. 따라서 dev/production 전체 HTML·첫 응답 시간·DOMContentLoaded, 실제 검색/더 보기/상세/사진 동작, 390px 모바일 화면 확인과 전체 `check-pages.mjs` 브라우저 모드는 남아 있다. 첫 화면 2초 목표의 달성을 확정할 수 없다. 정적 검사 통과를 브라우저 검사 통과로 보고하지 않는다.

## 변경 파일

- 목록 타입·조회: `types/catalog.ts`, `lib/catalog-query.ts`, `lib/services/catalog-service.ts`, `app/api/properties/route.ts`
- 목록 UI: `components/property/paged-catalog.tsx`, `components/property/property-card.tsx`, `app/dashboard/page.tsx`, `app/properties/page.tsx`, `app/test/page.tsx`
- 기존 공식 사진 연결의 카드 타입 호환: `lib/services/onbid-covers.ts`
- 공개 사이트: `sharing/public-app.tsx`, `sharing/link.tsx`, `scripts/build-pages.mjs`, `scripts/check-pages.mjs`, `docs/setup/github-pages.md`
- 빌드 분리: `next.config.ts`, `eslint.config.mjs`, `.gitignore`, `tsconfig.json`
- 검증: `tests/catalog-filters.test.ts`, `tests/catalog-live.test.ts`, `docs/qa/catalog-performance.json`

검색과 카드 조회는 기존 공개 읽기 권한만 사용한다. 원본 온비드 관찰 자료나 서버 인증정보를 공개 앱에 제공하지 않는다.
