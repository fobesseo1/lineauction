# 데이터 공장 → 노트북 이전 계획 (2026-11-16 작성, 사용자 승인 전)

이 문서만 보고 노트북 Claude가 따라 할 수 있게 쓴다. **사용자 승인 뒤에만 진행한다.**

- 이 PC(데스크톱): 사용자 폴더 `C:\Users\hjdh5`, 공장 이름 `office`
- 노트북: 사용자 폴더 `C:\Users\hjdh4`, 공장 이름 **`laptop`**, 저장소 위치 `C:\Users\hjdh4\auction-deal-finder`(setup.ps1 기본값)
- 비밀값(.env.local), 로그인, 본인 인증은 **사용자가 직접** 한다. 채팅·문서에 값을 쓰지 않는다.
- DB 구조 변경, 배포, 푸시는 사용자 허락 없이 하지 않는다.

## 1. 이 PC에서 자동으로 도는 것 (2026-11-16 조사)

작업 스케줄러 `\LineAuction\` 폴더. 모두 `wscript.exe`로 창 없이 실행한다.

| 이름 | 시간 | 걸리는 시간(11-06~16) | 하는 일 | 쓰는 키 이름 | 필요한 것 |
|---|---|---|---|---|---|
| Market Daily 9am | 매일 08:00(+로그인 시) | 50~85분 | 단지·실거래 수집 → 요약 올리기 → 분석 → 통계 → 선아파트 역 순위 계산·데우기 | SUPABASE_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL·PUBLISHABLE_KEY, MOLIT_API_KEY, VWORLD_API_KEY, R_ONE_API_KEY, FINLIFE_API_KEY, NAVER_MAP_*, REVALIDATE_SECRET, LINEESTATE_SITE_URL, LINEESTATE_DIR, SUPABASE_GATE_TOKEN, TELEGRAM_* | Node 24, Git, lineestate 복제본(아래 3절) |
| Onbid Daily 10am | 시장 작업 끝나면 바로(예비 10:30) | 10~20분 | 온비드 목록·종료 처리·상세 | ONBID_*, SUPABASE_*, VWORLD_API_KEY, TELEGRAM_* | Node 24 |
| Court Daily 3pm | 월~토, 온비드 끝나면 바로(예비 15:30) | 30~110분(토요일 전체 읽기는 더 김) | 법원 목록·매각결과·DB 반영 | SUPABASE_*, MOLIT_API_KEY, VWORLD_API_KEY, TELEGRAM_* | Node 24, **Microsoft Edge**(매각결과는 Edge 창 없이 띄워 읽음) |
| Detail Daily 7am | 매일 07:00(+로그인 시), 07:30까지 | 최대 30분 | 단지 상세(관리비·학교·어린이집·버스 등) | KINDER_API_KEY, CHILDCARE_API_KEY, SCHOOLINFO_API_KEY, MOLIT_API_KEY, SUPABASE_* | Node 24 |
| Telegram Bot every 1min | 1분마다 | 몇 초 | @line_estate_alert_bot 명령(/start, /stop) 받기 | TELEGRAM_BOT_TOKEN, SUPABASE_* | Node 24 |
| Watch every 10min | 10분마다 | 몇 초 | 멈춤·실패 감시, **이 PC의 윈도우 알림**만 띄움(DB 안 씀) | 없음 | Node 24 |

시장 → 온비드 → 법원은 한 줄로 이어 돈다(앞 작업이 끝나면 다음 작업 시작).

**로그인 필요한 사이트: 자동 작업에는 없다.** 법원·온비드·공공데이터는 키 또는 공개 페이지. 필요한 로그인은 노트북에서 GitHub(비공개 저장소 받기) 하나.

**그 밖에 찾은 것 (데이터 공장 자동 작업 아님)**
- `MosimDuo-FacilityCollect`(작업 스케줄러 맨 위, 매일 09:00): `welfare_source` 다른 프로젝트. 이번 이전에서 뺀다.
- `lineestate-sns` 폴더: 이미 노트북으로 옮겨 이 PC에서는 사용 안 함 상태. 손대지 않는다.
- Claude 예약 작업: 켜진 것은 `규제지역·토허 연장 확인 (12월)` 하나(12-22 한 번, 선아파트 규칙 확인). 데이터 공장 일이 아니므로 이 PC에 둔다.
- 상시 실행 프로그램·시작 프로그램: 데이터 공장 것 없음.
- 브라우저 자동화: 자동 작업은 법원 매각결과의 Edge뿐. ego-browser(호갱노노 확인)는 Claude가 손으로 할 때만 쓴다.

## 2. 옮길 것 / 남길 것

**옮긴다**: 위 표 6개 전부. 수집은 한 컴퓨터가 맡아야 하고, 노트북이 앞으로 계속 켜 두는 컴퓨터이기 때문.

**이 PC에 남긴다 (자동 아님)**
- 건축HUB 면적 자료(`area-extract.mjs`, `area-types.mjs`): 사용자가 3.3GB zip을 손으로 받아 가끔 돌림. 이 PC의 `data/area-types`(4.3GB)는 옮기지 않는다.
- 위 "그 밖에 찾은 것" 전부.
- 이 PC의 예약은 지우지 않고 '사용 안 함'으로만 둔다(되돌리기용).

## 3. 선아파트 사이트와 연결되는 곳

| 연결 | 노트북에서 할 일 |
|---|---|
| Supabase DB(공장이 쓰고 사이트가 읽음) | 없음. 컴퓨터와 상관없다. |
| 수집 기록 저장소(Supabase Storage `factory-state`) | setup 6단계가 내려받음. 컴퓨터끼리 이걸로 이어받는다. |
| 역 근처 순위·데우기(시장 작업 `revalidate` 단계) | 선아파트 저장소 **전용 복제본**이 필요. `git clone https://github.com/fobesseo1/lineestate.git C:\Users\hjdh4\lineestate-warm` → 그 폴더에서 `npm ci` → 그 폴더의 `.env.local`은 **사용자가 복사**(이 PC `lineestate-warm\.env.local`과 같은 것). 공장 `.env.local`의 `LINEESTATE_DIR` 줄을 노트북 경로로 바꾼다(경로만, 사용자가 하거나 사용자 허락 뒤 그 한 줄만). 사람이 고치는 작업 폴더를 쓰지 않는다. |
| 텔레그램 봇·알림 | 봇은 한 컴퓨터에서만 돌아야 한다(아래 4절 순서). |

## 4. 옮기는 순서

### 전: 노트북 사양 확인 (PowerShell)
```
Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors
"{0:N0} GB" -f ((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory/1GB)
Get-PSDrive C | Select-Object @{n='FreeGB';e={[int]($_.Free/1GB)}}
```
기준: 메모리 8GB 이상, **C 드라이브 빈 공간 40GB 이상**(수집 기록 약 10GB 이상 + 실거래 창고 6GB + 패키지·복제본 여유), SSD. CPU는 4코어면 충분(작업 대부분이 API 응답 기다림).

### 1단계 — 노트북 설치 (노트북 Claude)
1. 이 PC 쪽 커밋이 GitHub에 올라가 있어야 한다(노트북은 GitHub에서 받음). 푸시는 사용자 허락 뒤.
2. 사용자가 GitHub 로그인(비공개 저장소 받기용).
3. 저장소의 `setup\setup.bat`을 받아 실행하되 **봇 없이**:
   `powershell -ExecutionPolicy Bypass -File setup\setup.ps1 -Machine laptop -OffsetMinutes 0`
   - 0분 = 노트북이 07:30에 먼저 시작. 이 PC(office)는 08:00이라 둘째.
   - 4단계에서 `.env.local`을 묻는다 → **사용자가 직접** 붙여 넣거나 setup.bat 옆에 둔다.
   - 6단계 수집 기록 내려받기는 화면에 1.3GB라고 나오지만 지금은 약 10GB 이상(시장 기록만 6.5GB). 시간이 걸린다.
   - 7단계가 `Market Daily`, `Onbid Daily`, `Court Daily`, `Watch every 10min`을 등록한다.
4. 3절대로 `lineestate-warm` 복제본 + `npm ci`, `.env.local`(사용자), `LINEESTATE_DIR` 줄.
5. `Detail Daily 7am`과 `Telegram Bot`은 **아직 등록하지 않는다**(3단계에서).

### 2단계 — 첫 회차 (다음 날 아침, 두 대 모두 켠 채로)
- 시장·온비드·법원은 **두 대가 같이 켜져 있어도 동시에 돌지 않게** 코드에 잠금이 있다(DB 표 `factory_job_leases`: 하루 한 작업은 한 컴퓨터만, 다른 컴퓨터가 끝낸 작업은 건너뜀). 이번에 실제로 그렇게 되는지 확인한다.
- 노트북 07:30 시작 → 이 PC 08:00 시작은 "기다림/이미 끝남"으로 건너뛰어야 정상.
- 확인할 것:
  - 노트북 `data\daily\runs.jsonl` 마지막 줄들: market·onbid·court가 `machine":"laptop"`, `status":"completed"`.
  - 노트북 `data\daily\market.log`, `court-chain.log`, `onbid-chain.log`에 오류 없음. `revalidate` 단계 결과에 순위 계산 끝 줄이 있음.
  - 이 PC `data\daily\runs.jsonl`: 같은 날 `skipped`, `lease-done`(또는 lease-held) 만 있고 completed가 없어야 함.
  - 텔레그램 운영 방(@onemincheck)에 노트북 이름으로 완료 알림.
- 하나라도 이상하면 이 PC 쪽은 그대로 두고(다음 날 다시 맡음) 원인을 본다.

### 3단계 — 이 PC 끄기 + 나머지 둘 옮기기 (2단계가 정상인 날 오후)
상세 수집과 봇은 잠금이 없어서 두 대에서 같이 돌면 API 한도를 두 번 쓰고 DB에 두 번 쓴다. 그래서 **이 PC 먼저 끄고, 바로 노트북에 등록**한다. 그날 07:00 상세 수집이 끝난 뒤(오후)에 한다.
1. 이 PC(관리자 PowerShell):
   ```
   'Market Daily 9am','Onbid Daily 10am','Court Daily 3pm','Watch every 10min','Detail Daily 7am','Telegram Bot every 1min' | ForEach-Object { Disable-ScheduledTask -TaskPath '\LineAuction\' -TaskName $_ }
   ```
2. 노트북:
   - `powershell -ExecutionPolicy Bypass -File scripts\detail\register-schedule.ps1`
   - 봇: `setup\setup.ps1 -Machine laptop -OffsetMinutes 0 -WithBot` 다시 실행(이미 된 단계는 그대로, 봇 예약만 추가됨).
3. 텔레그램 봇에 `/start` 보내 답이 오는지 확인.

### 4단계 — 다음 날 아침 확인
- 노트북 `data\detail\schedule.log`에 07:00 실행 기록, 오류 없음.
- 시장·온비드·법원 완료 알림.
- 이 PC는 1주일 정도 '사용 안 함'으로 둔 채 지우지 않는다.

## 5. 되돌리기
노트북 예약을 '사용 안 함' → 이 PC 예약을 다시 '사용'. 수집 기록은 Storage로 이어받으므로 따로 옮길 것 없음.

## 6. 참고: 시간 겹침
노트북 기존 예약(05:40·17:40 각 약 12분, 08:00·13:00·19:00 각 수십 초)과 공장 시간(07:00 상세, 07:30부터 시장→온비드→법원 1.5~3시간)은 08:00 수십 초짜리 하나만 겹친다. 가벼워서 시간을 바꾸지 않는다.
