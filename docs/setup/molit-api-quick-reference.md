# 국토부 매매·전세·월세 API 간단 안내

작성일: 2026-10-10. 아래 거래 예시는 우리 수집기가 실제로 받은 XML 응답에서 발췌했습니다.

## 1. 무엇을 요청하나?

아파트 이름이나 가격을 넣는 대신 **시군구 + 계약 년월**을 지정합니다. 해당 지역·월의 거래 목록을 받아, 우리 프로그램에서 경매 물건의 단지명·주소·전용면적과 비교해 연결합니다.

| 요청 항목 | 쉬운 풀이 | 예시 |
|---|---|---|
| `serviceKey` | 해당 API 활용 승인을 받은 인증키 | `.env.local`의 `MOLIT_API_KEY` |
| `LAWD_CD` | 법정동 코드 앞 5자리인 시군구 코드 | `11200` = 서울 성동구 |
| `DEAL_YMD` | 계약 년월 6자리 | `202609` = 2026년 9월 |
| `pageNo` | 결과 페이지 번호 | `1` |
| `numOfRows` | 한 페이지에 받을 거래 수 | `1000` |

매매와 전월세는 각각 활용신청이 필요합니다. 이번에는 같은 인증키로 두 API 모두 이용할 수 있음을 확인했습니다. 키는 이 문서에 기록하지 않습니다.

## 2. 매매와 전월세 호출 주소

```text
아파트 매매:
https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade

아파트 전월세:
https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent
```

전세·월세를 따로 요청하지 않습니다. **전월세 API 응답에 함께 들어오며**, 받은 뒤 `monthlyRent`가 0이면 전세, 0보다 크면 월세가 있는 계약으로 나눕니다. 반전세도 보증금과 월세가 함께 있는 형태입니다.

## 3. 공통 응답 형식: XML

```xml
<response>
  <header>
    <resultCode>000</resultCode>
    <resultMsg>OK</resultMsg>
  </header>
  <body>
    <items>
      <item>거래 한 건의 항목들</item>
    </items>
    <numOfRows>1000</numOfRows>
    <pageNo>1</pageNo>
    <totalCount>411</totalCount>
  </body>
</response>
```

위 구조는 설명용으로 축약했습니다. `000 / OK`는 정상 응답, `totalCount`는 조회 조건에 해당하는 전체 거래 수입니다. `<item>` 하나가 거래 한 건입니다. 전체 거래 수가 페이지 크기보다 많으면 다음 페이지도 요청해야 합니다.

**API 요청 수와 거래 수는 다릅니다.** 실제 전월세 테스트는 요청 1회로 성동구 2026년 9월 거래 411건을 받았습니다. XML 원본을 저장하고, 프로그램 내부에서는 이를 객체(JSON 형태)로 읽어 처리합니다.

## 4. 실제 매매 응답 예시

성동구·2026년 3월 응답의 한 거래에서 핵심 항목만 원문 그대로 발췌했습니다.

```xml
<item>
  <aptNm>한진해모로</aptNm>
  <aptDong>101</aptDong>
  <umdNm>하왕십리동</umdNm>
  <jibun>1050</jibun>
  <excluUseAr>112.26</excluUseAr>
  <floor>13</floor>
  <dealAmount>143,000</dealAmount>
  <dealYear>2026</dealYear>
  <dealMonth>3</dealMonth>
  <dealDay>28</dealDay>
  <buildYear>2001</buildYear>
  <dealingGbn>중개거래</dealingGbn>
  <buyerGbn>개인</buyerGbn>
  <slerGbn>개인</slerGbn>
</item>
```

**쉬운 풀이:** 하왕십리동 1050, 한진해모로 101동의 전용 112.26㎡·13층이 2026년 3월 28일 **14억 3,000만원**에 중개거래됐다는 뜻입니다. 매수·매도자 구분은 개인이며, 건축연도는 2001년입니다.

원본: [성동구 2026년 3월 매매 XML](../../data/court/pipeline/molit-11200-202603-1.xml)

## 5. 실제 전세·월세 응답 예시

성동구·2026년 9월 응답에서 핵심 항목만 원문 그대로 발췌했습니다.

### 전세

```xml
<item>
  <aptNm>서울숲푸르지오</aptNm>
  <umdNm>금호동4가</umdNm>
  <jibun>340</jibun>
  <excluUseAr>59.99</excluUseAr>
  <floor>5</floor>
  <dealYear>2026</dealYear>
  <dealMonth>9</dealMonth>
  <dealDay>20</dealDay>
  <deposit>63,000</deposit>
  <monthlyRent>0</monthlyRent>
</item>
```

**쉬운 풀이:** 서울숲푸르지오 전용 59.99㎡·5층, 계약일 2026년 9월 20일, **보증금 6억 3,000만원·월세 0원**인 전세 계약입니다.

### 월세

```xml
<item>
  <aptNm>서울숲리버뷰자이</aptNm>
  <umdNm>행당동</umdNm>
  <jibun>380</jibun>
  <excluUseAr>59.97</excluUseAr>
  <floor>7</floor>
  <dealYear>2026</dealYear>
  <dealMonth>9</dealMonth>
  <dealDay>7</dealDay>
  <deposit>63,000</deposit>
  <monthlyRent>135</monthlyRent>
</item>
```

**쉬운 풀이:** 서울숲리버뷰자이 전용 59.97㎡·7층, 계약일 2026년 9월 7일, **보증금 6억 3,000만원·월세 135만원**인 계약입니다.

원본: [성동구 2026년 9월 전월세 XML](../../data/court/pipeline/molit-rent-test-11200-202609-1.xml)

## 6. 항목을 읽는 법

| 원본 항목 | 뜻 |
|---|---|
| `aptNm` | 아파트 이름 |
| `umdNm`, `jibun` | 법정동 이름, 지번 |
| `sggCd` | 시군구 코드 |
| `excluUseAr` | 전용면적, 단위 ㎡ |
| `floor` | 층 |
| `dealYear`, `dealMonth`, `dealDay` | 계약일의 연·월·일 |
| `dealAmount` | 매매금액, 단위 **만원** |
| `deposit` | 임대차 보증금, 단위 **만원** |
| `monthlyRent` | 월세, 단위 **만원/월** |
| `buildYear` | 건축연도 |
| `contractType`, `contractTerm` | 전월세 계약 구분·기간; 값이 비어 있을 수 있음 |
| `preDeposit`, `preMonthlyRent` | 전월세 종전 보증금·월세; 값이 비어 있을 수 있음 |
| `cdealType`, `cdealDay` | 매매 계약 해제 여부·해제일 |

금액은 쉼표를 제거한 숫자에 **10,000을 곱하면 원 단위**입니다. 빈 항목은 0원이나 특정 상태라고 임의로 해석하지 않습니다. 전월세는 개인정보 보호 때문에 동·호 정보를 제공하지 않습니다.

## 공식 안내

- [국토부 아파트 매매 실거래가 API](https://www.data.go.kr/data/15126469/openapi.do)
- [국토부 아파트 전월세 실거래가 API](https://www.data.go.kr/data/15126474/openapi.do)

현재 매매 전체 수집·매칭은 완료됐고, 전월세는 위 지역·월의 **1회 테스트만 진행**했습니다.
