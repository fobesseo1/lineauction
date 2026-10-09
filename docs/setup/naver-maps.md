# 네이버 Maps 연결 검증

2026-10-07 사용자가 신규 Maps Application에 Dynamic Map과 Geocoding을 등록하고 로컬 환경변수에 인증 정보를 저장했습니다.

- NEXT_PUBLIC_NAVER_MAP_CLIENT_ID: 브라우저 지도용 Client ID
- NAVER_MAP_CLIENT_SECRET: 서버 Geocoding용 Secret. 브라우저에 전달하지 않습니다.
- 공식 Geocoding endpoint: https://maps.apigw.ntruss.com/map-geocode/v2/geocode
- 신규 Maps SDK는 ncpKeyId 파라미터 사용

## 실제 검증

Geocoding에 공개 주소 `서울특별시 강남구 일원동 719`를 1회 요청했습니다. HTTP 200 / status OK, 결과 1건이며 주소는 `서울특별시 강남구 일원동 719 푸른마을아파트`, 경도 127.0808739, 위도 37.4838652입니다. 인증키와 인증 헤더는 기록하지 않습니다.

로컬 `/settings`에 연결 확인용 지도를 추가했습니다. 위 검증 좌표를 중심과 마커로 사용합니다. 브라우저에서 `http://127.0.0.1:3000/settings`의 실제 지도 타일·마커·확대/축소 컨트롤 표시를 확인했습니다. 공매나 비교 거래 매칭 결과를 의미하지 않으며 화면에도 연결 확인용 위치라고 표시합니다. 일반 페이지 방문 시 Geocoding을 반복 호출하지 않습니다.

지도 컴포넌트는 SDK 네트워크 실패·인증 실패·로딩 시간 초과를 표시하고, 페이지 이탈 시 지도·마커를 정리합니다. 키가 없으면 안내를 표시합니다. 외부 공유 전에는 배포 URL을 같은 Maps Application의 Web 서비스 URL에 추가해야 합니다.

## 공식 문서

- [Geocoding](https://api.ncloud-docs.com/docs/application-maps-geocoding)
- [신규 SDK 및 인증 실패 처리](https://navermaps.github.io/maps.js.ncp/docs/tutorial-2-Getting-Started.html)
- [Application과 도메인 설정](https://guide.ncloud-docs.com/docs/application-maps-app-vpc)
