# 공개 조회 사이트

주소: https://fobesseo1.github.io/lineauction/

GitHub Pages에는 조회 전용 웹 화면을 게시한다. 수집·오류 복구·국토부 API 요청은 기존 로컬 PC에서 계속 실행하며 외부 방문자에게 수집 실행이나 비공개 설정 변경 기능을 제공하지 않는다.

- 물건·입찰 조건·이력·실거래는 브라우저의 Supabase publishable key와 기존 공개 읽기 정책으로 조회한다. 새로고침하면 최신 DB 자료를 가져온다.
- 서버 secret/service-role/API 키, .env.local, 수집 원본·로그·체크포인트는 Git에서 제외한다. 공개 화면에는 publishable key만 포함된다.
- 사진은 public/media의 게시 시점 스냅샷이다. 카드 사진 로딩 실패 시 같은 크기의 대체 영역을 표시하며, 상세 사진은 해당 파일의 HEAD 응답을 확인해 게시된 사진만 표시한다. 전체 사진 파일 목록을 첫 화면에 내려받지 않는다. 새 사진을 게시하려면 사진 파일을 추가 커밋하고 push한다.
- 서울·경기 경매물건만 조회하며 묶음 물건의 모든 주소가 범위에 포함되는지 검사한다. 미관측을 종료로 추정하지 않는다.
- GitHub Pages의 정적 경로 제약에 맞춰 상세 링크는 `#/properties/물건UUID`를 사용한다. 이 주소를 그대로 공유·새로고침할 수 있다.
- 지도는 네이버지도 검색 링크로 제공한다. 서버 Geocoding 키는 공개 사이트에 포함하지 않는다.

## 게시 방법

GitHub 저장소 `fobesseo1/lineauction`의 Actions variables에 NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY를 설정한다. 이는 공개용 설정이다. 서버 키를 등록하지 않는다.

`main` push 또는 Publish LINE AUCTION workflow의 수동 실행으로 게시한다. 빌드는 `npm ci`, `npm run build:pages`이며 `.pages-work/out`을 Pages에 업로드한다. `.pages-work`는 별도 빌드 작업 공간이므로 로컬 Next dev 및 수집기의 파일을 덮어쓰지 않는다. 공통 검색·상세 컴포넌트를 복사하고 데이터 조회 부분만 브라우저용으로 변환한다. 원본 컴포넌트 구조가 바뀌면 빌드 어댑터의 가드가 실패하므로 검토한다.

로컬 검증: `npm run build:pages`, `node scripts/check-pages.mjs`, `node scripts/check-public-secrets.mjs`. 브라우저 검증은 대시보드·검색·상세·사진·직접 링크 새로고침·390px 화면의 가로 넘침을 확인한다. secret 검증은 현재 서버 인증값이 Git 대상이나 빌드 결과에 포함되지 않았는지 확인하며 인증값을 출력하지 않는다.
