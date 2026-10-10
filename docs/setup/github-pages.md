# 공개 조회 사이트

주소: https://lineauction.vercel.app

공개 사이트는 Vercel에서 이 저장소의 Next.js 앱을 그대로 서버 렌더링한다. `main`에 push하면 자동 배포된다. 수집·국토부 조회·오류 복구는 로컬 PC에서만 실행한다.

- 읽기 전용: Vercel 환경변수 `NEXT_PUBLIC_READ_ONLY_SITE=1`. `proxy.ts`가 설정 화면과 수집·감시 API(`/settings`, `/api/court-monitor`, `/api/onbid-progress`, `/api/cron/*`)를 404로 막고, 상단 메뉴에서 설정을 숨긴다.
- 환경변수는 공개 값만 둔다: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID`, `NEXT_PUBLIC_READ_ONLY_SITE`, `DEMO_MODE=false`. 서버 secret/service-role, 국토부·온비드·텔레그램·Cron 키는 Vercel에 넣지 않는다.
- 캐시: `next.config.ts`가 읽기 전용 배포에서만 목록·상세·검색 API에 `Vercel-CDN-Cache-Control: max-age=60, stale-while-revalidate=600`을 붙인다. DB 변경은 최대 약 1분 뒤 보인다.
- 서버 함수 리전은 Supabase(서울)와 같은 `icn1`.
- 사진: 법원 사진은 Supabase Storage 공개 버킷 `court-media`에 있다(누구나 읽기, 쓰기는 서버 secret key만). 수집기의 `photo-db-sync.mjs`와 `pipeline-bulk.mjs`가 DB에 쓰기 전에 없는 파일을 올리므로 배포 없이 바로 표시된다. 로컬 `public/media/court/`는 원본 보관용이며 Git에 포함하지 않는다. 이전 로컬 경로는 `property_media_path_backup` 표에 있다.

## 이전 GitHub Pages 주소

https://fobesseo1.github.io/lineauction/ 은 `pages-redirect/`의 안내 페이지만 게시해 새 주소로 넘긴다. 예전 상세 링크 `#/properties/물건ID`는 `/properties/물건ID`로 이동한다. 더 필요 없으면 GitHub 저장소 Settings → Pages에서 끄고 `pages-redirect/`와 `.github/workflows/pages.yml`을 지운다.

비공개 인증정보 검사: `node scripts/check-public-secrets.mjs`.
