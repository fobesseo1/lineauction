# 웹사이트 속도 개선 — 에이전트 지시서

작업 폴더: `C:\Users\hjdh5\Desktop\auction-deal-finder`
먼저 `AGENTS.md`를 읽고, 이 프로젝트의 Next.js(16.3.8) 문서(`node_modules/next/dist/docs/`)에서 관련 부분을 확인한 뒤 작업한다.

## 문제
로컬(`http://127.0.0.1:3000`, `next dev`)과 공개 사이트가 매우 느리고 무겁다. 사진(webp, 장당 약 5KB)은 원인이 아니다.

## 이미 측정된 사실 (2026-10-10)
| 페이지 | HTML 크기 | 시간 |
|---|---|---|
| `/dashboard` | 9.5MB | 캐시가 비었을 때 8~9초, 30초 안에 다시 열면 0.7초 |
| `/properties` | 21.5MB (물건 행이 17,361번 반복 직렬화됨. 물건은 약 6,570건) | 응답만 1.7초, 브라우저 처리 시간은 별도 |

원인:
1. `app/dashboard/page.tsx`와 `app/properties/page.tsx`가 `loadPropertyList()`로 **물건 전체**를 읽어 클라이언트 컴포넌트(`components/property/dashboard-search.tsx`, `components/property/property-browser.tsx`)에 props로 넘긴다. 그 결과 전체 데이터가 HTML/RSC payload에 실린다. 화면에는 24개만 보여주고, 검색은 브라우저에서 전체 배열을 필터링한다.
2. `lib/repositories/property-repository.ts`의 `listProperties()`가 `properties_catalog`에서 `select('*')`로 모든 칸을 읽는다. 1,000건씩 페이지로 나눠 전부 읽은 뒤 Zod로 검증한다. 메모리 캐시는 30초뿐이다.
3. 두 페이지가 `force-dynamic`이다.
4. `next dev`라서 최적화가 꺼져 있다. 다만 1~3을 고치지 않으면 production 빌드에서도 무겁다.

## 목표
- 첫 화면 HTML·데이터를 수백 KB 이하로 줄인다.
- 캐시가 빈 상태에서도 첫 화면이 2초 안에 보이고, 검색 응답이 1초 안에 오게 한다.
- 기능은 그대로 유지한다: 법원/온비드/전체 구분, 검색(지역·주소·사건번호·관리번호), "물건 더 보기", 상세, 사진, 실거래 비교, 모바일 화면.

## 개선 방향 (측정 후 조정 가능)
1. **목록은 서버에서 페이지 단위로**: 첫 화면은 24건만 보낸다. "더 보기"와 검색은 서버(Route Handler 또는 Server Action)나 Supabase 쿼리로 필요한 만큼만 가져온다. 검색도 DB 쪽에서 한다(ilike, 인덱스, 필요하면 view/RPC).
2. **필요한 칸만 select**: 카드에 쓰는 필드만 담는 목록용 타입과 쿼리를 따로 만든다. 상세 필드는 상세 페이지에서만 읽는다.
3. **집계 숫자**(물건 수 등)는 count 쿼리나 집계 view로 구한다. 전체 배열 길이로 세지 않는다.
4. **캐시**: 공개 읽기 데이터는 캐시 시간을 늘리거나 Next 캐시 기능을 쓴다. 이 버전 문서의 권장 방식을 따른다. 수집 직후 갱신이 늦어지는 정도는 몇 분이면 허용된다.
5. 지도나 대량 표시가 꼭 필요한 화면은 좌표·가격·ID만 담은 가벼운 목록을 따로 둔다.

## 공개 사이트(GitHub Pages)도 확인
- `docs/setup/github-pages.md` 참고. `npm run build:pages`가 공통 검색·상세 컴포넌트를 `.pages-work`로 복사하고, 데이터 조회 부분만 브라우저용(Supabase publishable key)으로 바꾼다(`sharing/` 폴더, 빌드 어댑터 가드).
- 공개 사이트도 브라우저에서 전체 물건을 내려받는 구조인지 측정하고, 같은 원칙(페이지 단위, 필요한 칸만)을 적용한다.
- 컴포넌트 구조를 바꾸면 빌드 어댑터 가드가 실패할 수 있으니 함께 수정한다.
- 검증: `npm run build:pages`, `node scripts/check-pages.mjs`, `node scripts/check-public-secrets.mjs`.

## 규칙
- `scripts/court/`와 `data/court/`는 건드리지 않는다. 지금 사진 수집과 국토부 작업이 실행 중이다. 그 프로세스를 중지·재시작하지 않는다.
- DB 스키마 변경(인덱스, view, RPC)이 필요하면 migration 파일로 만들고, 운영 Supabase에 적용하기 전에 사용자에게 확인받는다. 공개 읽기 정책(RLS)을 넓히지 않는다.
- 서버 키, `.env.local`, `data/`는 Git과 공개 빌드에 넣지 않는다.
- 커밋·푸시·배포는 사용자 승인 후에 한다.

## 검증과 보고
- 개선 전후로 각 페이지의 HTML·데이터 크기, 캐시가 빈 상태의 첫 응답 시간, 검색 응답 시간, 브라우저 DOMContentLoaded를 측정한다. dev와 `next build && next start` 양쪽에서 잰다.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` 통과.
- 브라우저에서 대시보드, 검색, 더 보기, 상세, 사진, 390px 모바일 화면을 확인한다.
- 전후 수치표와 바꾼 파일 목록을 보고한다.
