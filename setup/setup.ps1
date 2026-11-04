# 선경매 데이터 공장 설치 (새 Windows PC에서 한 번 실행)
#   setup.bat 을 더블클릭하거나:  powershell -ExecutionPolicy Bypass -File setup.ps1 [-Machine office] [-OffsetMinutes 30] [-DryRun]
# 하는 일: Node·Git 설치 → 코드 받기 → 패키지 설치 → .env.local 넣기 → 수집 기록 내려받기 →
#          작업 스케줄러 등록 → 연결 확인 → 텔레그램 "등록 완료".
# 비밀값(.env.local)은 이 파일에 없습니다. 같은 폴더에 둔 .env.local을 쓰거나, 설치 중에 붙여 넣습니다.
param(
  [string]$Machine,                 # 이 PC의 이름 (예: home, office, laptop). 알림과 기록에 쓰입니다.
  [int]$OffsetMinutes = -1,         # 시작 시각을 몇 분 늦출지 (0, 30, 60 …). PC마다 다르게.
  [string]$Folder = "$env:USERPROFILE\auction-deal-finder",
  [string]$Repo = 'https://github.com/fobesseo1/lineauction.git',
  [switch]$WithBot,                 # 텔레그램 봇 응답(1분마다)도 이 PC에서 돌릴 때만. 여러 대가 같이 돌리면 안 됩니다.
  [switch]$DryRun                   # 아무것도 바꾸지 않고 할 일만 보여 줍니다.
)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
function Say($text) { Write-Host "`n▶ $text" -ForegroundColor Cyan }
function Do-Step($text, [scriptblock]$action) { if ($DryRun) { Write-Host "  (예행) $text" } else { Write-Host "  $text"; & $action } }
function Refresh-Path { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }

Say '1/8 이 PC 이름과 시작 시각'
if (-not $Machine) { $Machine = Read-Host '이 PC 이름 (영문, 예: home / office / laptop)' }
if ($Machine -notmatch '^[A-Za-z0-9_-]{2,20}$') { throw 'PC 이름은 영문·숫자·-·_ 2~20자로 해 주세요.' }
if ($OffsetMinutes -lt 0) { $OffsetMinutes = [int](Read-Host '시작 시각을 몇 분 늦출까요? (첫 PC 0, 둘째 30, 셋째 60)') }
$at = { param($h) (Get-Date -Hour $h -Minute 0 -Second 0).AddMinutes($OffsetMinutes) }
Write-Host ("  {0}: 단지·실거래 {1:HH:mm} · 온비드 {2:HH:mm} · 법원 {3:HH:mm} (평일)" -f $Machine, (& $at 9), (& $at 10), (& $at 15))

Say '2/8 Node.js(24 이상)와 Git'
Refresh-Path
$node = Get-Command node -ErrorAction SilentlyContinue
$nodeMajor = if ($node) { [int]((& node --version).TrimStart('v').Split('.')[0]) } else { 0 }
if ($nodeMajor -lt 24) { Do-Step 'Node.js LTS 설치 (winget)' { winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements; Refresh-Path } }
else { Write-Host "  Node $(& node --version) 있음" }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Do-Step 'Git 설치 (winget)' { winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements; Refresh-Path } }
else { Write-Host "  $(& git --version) 있음" }

Say "3/8 코드 받기 → $Folder"
if (Test-Path "$Folder\.git") { Do-Step '이미 있음 → 최신으로 (git pull --ff-only)' { git -C $Folder pull --ff-only } }
else { Do-Step "git clone $Repo" { git clone $Repo $Folder } }

Say '4/8 비밀값 (.env.local)'
$envTarget = "$Folder\.env.local"
if (Test-Path $envTarget) { Write-Host '  이미 있음 (그대로 둡니다)' }
elseif (Test-Path "$here\.env.local") { Do-Step '설치 파일 옆의 .env.local 복사' { Copy-Item "$here\.env.local" $envTarget } }
elseif ($DryRun) { Write-Host '  (예행) .env.local 붙여 넣기 받기' }
else {
  Write-Host '  .env.local 내용을 붙여 넣고, 빈 줄에서 Enter를 두 번 누르세요.'
  $lines = @(); while ($true) { $l = Read-Host; if ($l -eq '' -and $lines.Count -and $lines[-1] -eq '') { break }; $lines += $l }
  Do-Step '.env.local 저장' { Set-Content -Path $envTarget -Value ($lines -join "`n").Trim() -Encoding utf8 }
}
if (-not $DryRun) {
  $content = Get-Content $envTarget -Raw
  foreach ($need in 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID') { if ($content -notmatch "(?m)^$need=\S") { throw ".env.local에 $need 값이 없습니다." } }
  if ($content -match '(?m)^FACTORY_MACHINE=') { $content = $content -replace '(?m)^FACTORY_MACHINE=.*$', "FACTORY_MACHINE=$Machine" } else { $content = $content.TrimEnd() + "`nFACTORY_MACHINE=$Machine`n" }
  Set-Content -Path $envTarget -Value $content -Encoding utf8 -NoNewline
}
Write-Host "  FACTORY_MACHINE=$Machine"

Say '5/8 패키지 설치 (npm ci, 법원 수집은 Windows에 있는 Edge를 씁니다)'
Do-Step 'npm ci' { Push-Location $Folder; try { npm ci --no-audit --no-fund } finally { Pop-Location } }

Say '6/8 수집 기록 내려받기 (약 1.3GB, 처음 한 번)'
Do-Step 'node scripts/daily/bundle.mjs download' { Push-Location $Folder; try { node scripts/daily/bundle.mjs download } finally { Pop-Location } }

Say '7/8 작업 스케줄러 등록 (\LineAuction\)'
$vbs = "$Folder\scripts\daily\run-hidden.vbs"
$tasks = @(
  @{ Name = 'Market Daily'; Args = "`"$vbs`" market schedule"; Trigger = { New-ScheduledTaskTrigger -Daily -At (& $at 9) } },
  @{ Name = 'Onbid Daily'; Args = "`"$vbs`" onbid schedule"; Trigger = { New-ScheduledTaskTrigger -Daily -At (& $at 10) } },
  @{ Name = 'Court Daily'; Args = "`"$vbs`" court schedule"; Trigger = { New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday, Tuesday, Wednesday, Thursday, Friday -At (& $at 15) } },
  @{ Name = 'Watch every 10min'; Args = "`"$Folder\scripts\daily\watch-hidden.vbs`""; Trigger = { New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Minutes 10) } }
)
if ($WithBot) { $tasks += @{ Name = 'Telegram Bot every 1min'; Args = "`"$Folder\scripts\alerts\bot-hidden.vbs`""; Trigger = { New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1) } } }
foreach ($t in $tasks) {
  Do-Step "등록: $($t.Name)" {
    $triggers = @(& $t.Trigger)
    # 켜거나 로그인할 때도 한 번: 정해진 시각 전이면 실행기가 스스로 기다리지 않고 끝납니다.
    if ($t.Name -notlike '*every*') { $triggers += New-ScheduledTaskTrigger -AtLogOn }
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 12) -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskPath '\LineAuction\' -TaskName $t.Name -Action (New-ScheduledTaskAction -Execute 'wscript.exe' -Argument $t.Args -WorkingDirectory $Folder) -Trigger $triggers -Settings $settings -Force | Out-Null
  }
}

Say '8/8 연결 확인 + 텔레그램 "등록 완료"'
Do-Step '저장소·잠금 표 확인 후 알림' {
  Push-Location $Folder
  try {
    node scripts/daily/bundle.mjs status
    node --input-type=module -e "const {db,notifyOperator}=await import('./scripts/daily/factory.mjs');const {error}=await db.from('factory_job_leases').select('job').limit(1);if(error)throw Error(error.message);const r=await notifyOperator('<b>✅ $Machine 등록 완료</b>\n데이터 공장 PC로 등록됐습니다. 시작 시각 +$OffsetMinutes분. 켜져 있으면 그날 작업을 맡습니다.');if(!r.ok)throw Error(r.description);console.log('telegram ok');"
  } finally { Pop-Location }
}

Write-Host "`n완료." -ForegroundColor Green
Write-Host '절전 끄기(권장): 설정 → 시스템 → 전원 → 화면과 절전 → "절전 모드 전환"을 "안 함"으로.'
Write-Host '  또는 관리자 PowerShell에서:  powercfg /change standby-timeout-ac 0'
Write-Host "기록은 $Folder\data, 실행 기록은 $Folder\data\daily\runs.jsonl 에 남습니다."
