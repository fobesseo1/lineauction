# 디자인 에셋 기록

전체 UI: shadcn/ui + Tailwind CSS. 글꼴: Pretendard Variable, 자간 -0.5% (`-0.005em`).

## 사용자 제공 원본

- 디자인 시스템: `docs/design/DESIGNstyle-lineestate.md`
- 현재 SVG 로고: `public/brand/lineauction-logo.svg` (사용자가 제공한 선경매 · LINE AUCTION 원본, 2026-10-06 적용)
- 이전 SVG 로고: `public/brand/lineestate-logo.svg` (원본 기록 보관)

## 로컬 폰트

- `public/fonts/PretendardVariable.woff2`
- `public/fonts/Pretendard-LICENSE.txt` (SIL Open Font License)
- [공식 Pretendard v1.3.9 원본](https://github.com/orioncactus/pretendard/tree/v1.3.9/packages/pretendard/dist/web/variable)

## AI 생성 이미지

2026-10-06에 Codex 내장 imagegen으로 생성했습니다. 실제 공매물건의 사진이 아닌 가상 데이터 전용입니다. 3종을 8건의 데모에 재사용합니다.

### 아파트

저장 경로: `public/demo/apartment.png`

> Use case: photorealistic-natural. Asset type: fictional real estate listing photo for a Korean auction research demo. Primary request: professional property photography of a contemporary Korean apartment living room, warm daylight, cream sofa, oak floor, linen curtains, wide windows with soft urban skyline, quietly premium and realistic. Composition: wide interior photo, no people, no text, no logos, no watermark; natural colors, no heavy filters.

### 오피스텔

저장 경로: `public/demo/officetel.png`

> Use case: photorealistic-natural. Asset type: fictional Korean officetel listing photo for a real estate dashboard demo. Primary request: bright compact modern Korean studio apartment interior with a kitchenette, light oak furniture, a clean desk by a large window, neutral cream walls and soft linen, professionally photographed with believable natural daylight. Composition: wide architectural interior photograph, no people, no text, no logos, no watermark.

### 상가·업무시설

저장 경로: `public/demo/commercial.png`

> Use case: photorealistic-natural. Asset type: fictional commercial property photo for a Korean real estate dashboard demo. Primary request: contemporary low rise Korean retail and office building exterior, pale stone facade, large glazed storefronts, small planted trees along a quiet pedestrian street, warm afternoon daylight, architectural photography, realistic materials. Composition: wide three-quarter street view, no people, no legible signs or text, no logos, no watermark, no exaggerated luxury.
