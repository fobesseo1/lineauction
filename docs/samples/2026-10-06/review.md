# 실제 API 원시 데이터와 수집·비교 설계 초안

조회일: 2026-10-06. 국토부는 강남구 LAWD_CD=11680, 계약월 DEAL_YMD=202609, pageNo=1, numOfRows=1로 요청했습니다. 각 서비스 모두 HTTP 200 / resultCode 000 / OK입니다. 온비드는 압류재산·매각·전자입찰 목록 1건이며 HTTP 200 / resultCode 00입니다.

키와 요청 URL의 인증 쿼리는 기록하지 않았습니다. DB 저장이나 화면 연동은 하지 않았습니다. 표본은 API 첫 행이며 대표 가격을 뜻하지 않습니다. 원문 XML과 JSON 변환본을 같은 폴더에 저장했습니다. JSON은 필드명과 문자열 값을 유지한 읽기용 변환본입니다.

## 아파트

전체 75건 중 첫 1건. [XML 원문](./molit-apartment.xml), [전체 응답 JSON](./molit-apartment.json)

```json
{
  "aptDong": "",
  "aptNm": "푸른마을아파트101동~111동",
  "buildYear": "1994",
  "buyerGbn": "개인",
  "cdealDay": "",
  "cdealType": "",
  "dealAmount": "203,500",
  "dealDay": "4",
  "dealMonth": "9",
  "dealYear": "2026",
  "dealingGbn": "직거래",
  "estateAgentSggNm": "",
  "excluUseAr": "84.93",
  "floor": "13",
  "jibun": "719",
  "landLeaseholdGbn": "N",
  "rgstDate": "",
  "sggCd": "11680",
  "slerGbn": "개인",
  "umdNm": "일원동"
}
```

| 원래 필드 | 공식 의미 |
| --- | --- |
| aptDong | 아파트 동명 |
| aptNm | 단지명 |
| buildYear | 건축년도 |
| buyerGbn | 거래주체정보_매수자(개인/법인/공공기관/기타) |
| cdealDay | 해제사유발생일 |
| cdealType | 해제여부 |
| dealAmount | 거래금액(만원) |
| dealDay | 계약일 |
| dealMonth | 계약월 |
| dealYear | 계약년도 |
| dealingGbn | 거래유형(중개 및 직거래 여부) |
| estateAgentSggNm | 중개사소재지(시군구 단위) |
| excluUseAr | 전용면적 |
| floor | 층 |
| jibun | 지번 |
| landLeaseholdGbn | 토지임대부 아파트 여부 |
| rgstDate | 등기일자 |
| sggCd | 지역코드 |
| slerGbn | 거래주체정보_매도자(개인/법인/공공기관/기타) |
| umdNm | 법정동 |

## 오피스텔

전체 45건 중 첫 1건. [XML 원문](./molit-officetel.xml), [전체 응답 JSON](./molit-officetel.json)

```json
{
  "buildYear": "1991",
  "buyerGbn": "법인",
  "cdealDay": "",
  "cdealType": "",
  "dealAmount": "28,500",
  "dealDay": "21",
  "dealMonth": "9",
  "dealYear": "2026",
  "dealingGbn": "중개거래",
  "estateAgentSggNm": "서울 강남구",
  "excluUseAr": "40.64",
  "floor": "13",
  "jibun": "203-1",
  "offiNm": "거평타운오피스텔",
  "sggCd": "11680",
  "sggNm": "강남구",
  "slerGbn": "개인",
  "umdNm": "논현동"
}
```

| 원래 필드 | 공식 의미 |
| --- | --- |
| buildYear | 건축년도 |
| buyerGbn | 거래주체정보_매수자(개인/법인/공공기관/기타) |
| cdealDay | 해제사유발생일 |
| cdealType | 해제여부 |
| dealAmount | 거래금액(만원) |
| dealDay | 계약일 |
| dealMonth | 계약월 |
| dealYear | 계약년도 |
| dealingGbn | 거래유형(중개 및 직거래 여부) |
| estateAgentSggNm | 중개사소재지(시군구 단위) |
| excluUseAr | 전용면적 |
| floor | 층 |
| jibun | 지번 |
| offiNm | 단지명 |
| sggCd | 지역코드 |
| sggNm | 시군구 |
| slerGbn | 거래주체정보_매도자(개인/법인/공공기관/기타) |
| umdNm | 법정동 |

## 상업·업무용

전체 51건 중 첫 1건. [XML 원문](./molit-commercial.xml), [전체 응답 JSON](./molit-commercial.json)

```json
{
  "buildYear": "1999",
  "buildingAr": "47.29",
  "buildingType": "집합",
  "buildingUse": "업무",
  "buyerGbn": "법인",
  "cdealDay": "",
  "cdealType": "",
  "dealAmount": "86,000",
  "dealDay": "11",
  "dealMonth": "9",
  "dealYear": "2026",
  "dealingGbn": "중개거래",
  "estateAgentSggNm": "서울 강남구",
  "floor": "26",
  "jibun": "467-6",
  "landUse": "일반상업",
  "plottageAr": "",
  "sggCd": "11680",
  "sggNm": "강남구",
  "shareDealingType": "",
  "slerGbn": "개인",
  "umdNm": "도곡동"
}
```

| 원래 필드 | 공식 의미 |
| --- | --- |
| buildYear | 건축년도 |
| buildingAr | 건물면적 |
| buildingType | 건물유형(일반/집합) |
| buildingUse | 건물주용도 |
| buyerGbn | 거래주체정보_매수자(개인/법인/공공기관/기타) |
| cdealDay | 해제사유발생일 |
| cdealType | 해제여부 |
| dealAmount | 거래금액(만원) |
| dealDay | 계약일 |
| dealMonth | 계약월 |
| dealYear | 계약년도 |
| dealingGbn | 거래유형(중개 및 직거래 여부) |
| estateAgentSggNm | 중개사소재지(시군구 단위) |
| floor | 층 |
| jibun | 지번 |
| landUse | 용도지역 |
| plottageAr | 대지면적 |
| sggCd | 지역코드 |
| sggNm | 시군구 |
| shareDealingType | 지분거래구분 |
| slerGbn | 거래주체정보_매도자(개인/법인/공공기관/기타) |
| umdNm | 법정동 |

## 토지

전체 175건 중 첫 1건. [XML 원문](./molit-land.xml), [전체 응답 JSON](./molit-land.json)

```json
{
  "cdealDay": "",
  "cdealType": "",
  "dealAmount": "2,000",
  "dealArea": "3.31",
  "dealDay": "15",
  "dealMonth": "9",
  "dealYear": "2026",
  "dealingGbn": "직거래",
  "estateAgentSggNm": "",
  "jibun": "6**",
  "jimok": "도로",
  "landUse": "제2종일반주거지역",
  "sggCd": "11680",
  "sggNm": "강남구",
  "shareDealingType": "지분",
  "umdNm": "역삼동"
}
```

| 원래 필드 | 공식 의미 |
| --- | --- |
| cdealDay | 해제사유발생일 |
| cdealType | 해제여부 |
| dealAmount | 거래금액(만원) |
| dealArea | 거래면적 |
| dealDay | 계약일 |
| dealMonth | 계약월 |
| dealYear | 계약년도 |
| dealingGbn | 거래유형(중개 및 직거래 여부) |
| estateAgentSggNm | 중개사소재지(시군구 단위) |
| jibun | 지번 |
| jimok | 지목 |
| landUse | 용도지역 |
| sggCd | 지역코드 |
| sggNm | 시군구 |
| shareDealingType | 지분거래구분 |
| umdNm | 법정동 |

## 연립·다세대

전체 48건 중 첫 1건. [XML 원문](./molit-rowhouse.xml), [전체 응답 JSON](./molit-rowhouse.json)

```json
{
  "buildYear": "2017",
  "buyerGbn": "개인",
  "cdealDay": "",
  "cdealType": "",
  "dealAmount": "47,000",
  "dealDay": "30",
  "dealMonth": "9",
  "dealYear": "2026",
  "dealingGbn": "중개거래",
  "estateAgentSggNm": "서울 강남구",
  "excluUseAr": "30.39",
  "floor": "5",
  "houseType": "다세대",
  "jibun": "270-35",
  "landAr": "20",
  "mhouseNm": "아이리스논현",
  "rgstDate": "",
  "sggCd": "11680",
  "slerGbn": "개인",
  "umdNm": "논현동"
}
```

| 원래 필드 | 공식 의미 |
| --- | --- |
| buildYear | 건축년도 |
| buyerGbn | 거래주체정보_매수자(개인/법인/공공기관/기타) |
| cdealDay | 해제사유발생일 |
| cdealType | 해제여부 |
| dealAmount | 거래금액(만원) |
| dealDay | 계약일 |
| dealMonth | 계약월 |
| dealYear | 계약년도 |
| dealingGbn | 거래유형(중개 및 직거래 여부) |
| estateAgentSggNm | 중개사소재지(시군구 단위) |
| excluUseAr | 전용면적 |
| floor | 층 |
| houseType | 명세 설명 확인 필요 |
| jibun | 지번 |
| landAr | 대지권면적 |
| mhouseNm | 연립다세대명 |
| rgstDate | 등기일자 |
| sggCd | 지역코드 |
| slerGbn | 거래주체정보_매도자(개인/법인/공공기관/기타) |
| umdNm | 법정동 |

## 단독·다가구

전체 1건 중 첫 1건. [XML 원문](./molit-detached.xml), [전체 응답 JSON](./molit-detached.json)

```json
{
  "buildYear": "1995",
  "buyerGbn": "개인",
  "cdealDay": "",
  "cdealType": "",
  "dealAmount": "165,000",
  "dealDay": "12",
  "dealMonth": "9",
  "dealYear": "2026",
  "dealingGbn": "중개거래",
  "estateAgentSggNm": "서울 강남구",
  "houseType": "다가구",
  "jibun": "1***",
  "plottageAr": "117.1",
  "sggCd": "11680",
  "slerGbn": "개인",
  "totalFloorAr": "177.69",
  "umdNm": "개포동"
}
```

| 원래 필드 | 공식 의미 |
| --- | --- |
| buildYear | 건축년도 |
| buyerGbn | 거래주체정보_매수자(개인/법인/공공기관/기타) |
| cdealDay | 해제사유발생일 |
| cdealType | 해제여부 |
| dealAmount | 거래금액(만원) |
| dealDay | 계약일 |
| dealMonth | 계약월 |
| dealYear | 계약년도 |
| dealingGbn | 거래유형(중개 및 직거래 여부) |
| estateAgentSggNm | 중개사소재지(시군구 단위) |
| houseType | 주택유형(단독/다가구) |
| jibun | 지번 |
| plottageAr | 대지면적 |
| sggCd | 지역코드 |
| slerGbn | 거래주체정보_매도자(개인/법인/공공기관/기타) |
| totalFloorAr | 연면적 |
| umdNm | 법정동 |

## 온비드 공매 목록

[API 원문 JSON](./onbid.json)

```json
{
  "onbidCltrno": 2004224,
  "cltrMngNo": "2020-11444-010",
  "pbctCdtnNo": 6221875,
  "onbidPbancNo": 907354,
  "pbctNo": 10105028,
  "pbctNsq": "005",
  "pbctsn": null,
  "prptDivCd": "0007",
  "prptDivNm": "압류재산",
  "dspsMthodCd": "0001",
  "dspsMthodNm": "매각",
  "bidDivCd": "0001",
  "bidDivNm": "전자입찰",
  "bidMthodCd": "0001",
  "bidMthodNm": "최고가방식",
  "cptnMthodCd": "0001",
  "cptnMthodNm": "일반경쟁",
  "totalamtUnpcDivCd": "0001",
  "totalamtUnpcDivNm": "총액",
  "cltrUsgLclsCtgrId": "10000",
  "cltrUsgMclsCtgrId": "10100",
  "cltrUsgSclsCtgrId": "10102",
  "cltrUsgLclsCtgrNm": "부동산",
  "cltrUsgMclsCtgrNm": "토지",
  "cltrUsgSclsCtgrNm": "임야",
  "onbidCltrNm": "전북특별자치도 김제시 서암동 248-20  ",
  "usbdNft": 0,
  "bidPrgnNft": 0,
  "pvctTrgtYn": "N",
  "batcBidYn": null,
  "cltrBidBgngDt": "202702011400",
  "cltrBidEndDt": "202702031700",
  "apslEvlAmt": 14500000,
  "lowstBidPrcIndctCont": "1450000",
  "frstBidPrc": 0,
  "apslPrcCtrsLowstBidRto": null,
  "frstCtrsLowstBidPrcRto": null,
  "feeRate": null,
  "ltnoPnu": "5221010700002480020",
  "rdnmPnu": null,
  "lctnSdnm": "전북특별자치도",
  "lctnSggnm": "김제시",
  "lctnEmdNm": "서암동",
  "rqstOrgNm": "김해세무서",
  "orgNm": "한국자산관리공사",
  "eltrGrprUseYn": "N",
  "collbBidPsblYn": "Y",
  "twtmGthrBidPsblYn": "Y",
  "subtBidPsblYn": "Y",
  "evcRsbyTrgtCont": "매수인",
  "landSqms": 100,
  "bldSqms": 0,
  "alcYn": "Y",
  "dtbtRqrEdtmCont": "2026/07/20",
  "rentMthodNm": null,
  "rentPerdCont": "-",
  "thnlImgUrlAdr": "https://www.onbid.co.kr/op/cm/syc/filemng/filemngprcs/FileMngPrcsController/dnldFile.do?atchFileLstNo=17100224&atchSn=2&hashCrpsNo=APJAONJNCNOIBNOKBHAJOOGOFIBJHGFBLDFCINIKIFNAOCEPJJPBNHFOIINCDDGN&downloadImageKind=THNL_NM",
  "mdfcnDt": "20260930103535",
  "crtnYn": "N",
  "pbctStatCd": "0001",
  "pbctStatNm": "입찰준비중",
  "cltrStatMngCd": "0002"
}
```
