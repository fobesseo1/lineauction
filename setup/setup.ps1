# 선경매 데이터 공장 설치 (새 Windows PC에서 한 번 실행)
#   setup.bat 을 더블클릭하거나:  powershell -ExecutionPolicy Bypass -File setup.ps1 [-Machine laptop] [-OffsetMinutes 30] [-DryRun]
# 하는 일: Node·Git 설치 → 코드 받기 → .env.local 넣기 → 패키지 설치 → 수집 기록 내려받기 →
#          작업 스케줄러 등록 → 연결 확인 → 텔레그램 "등록 완료".
# 비밀값(.env.local)은 이 파일에 없습니다. 같은 폴더에 둔 .env.local을 쓰거나, 설치 중에 붙여 넣습니다.
# 작업 스케줄러 등록에 관리자 권한이 필요해서, 관리자가 아니면 관리자 창으로 다시 엽니다.
# 어느 단계든 실패하면 "실패: N/8 단계"로 끝납니다. 같은 설치 파일을 다시 실행해도 됩니다.
param(
  [string]$Machine,                 # 이 PC의 이름 (예: home, office, laptop). 알림과 기록에 쓰입니다.
  [int]$OffsetMinutes = -1,         # 시작 시각을 몇 분 늦출지 (0, 30, 60 …). PC마다 다르게.
  [string]$Folder = "$env:USERPROFILE\auction-deal-finder",
  [string]$Repo = 'https://github.com/fobesseo1/lineauction.git',
  [switch]$WithBot,                 # 텔레그램 봇 응답(1분마다)도 이 PC에서 돌릴 때만. 여러 대가 같이 돌리면 안 됩니다.
  [switch]$DryRun,                  # 아무것도 바꾸지 않고 할 일만 보여 줍니다.
  [int]$StopAfter = 8,              # 시험용: 이 단계까지만 하고 멈춥니다.
  [switch]$Elevated,                # 관리자 창으로 다시 열렸을 때 붙습니다.
  [string]$EnvFrom                  # 받은 코드 안의 새 설치 파일로 넘어갈 때, 처음 설치 파일 옆의 .env.local 위치.
)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$utf8 = New-Object Text.UTF8Encoding $false      # BOM 없는 UTF-8 (Windows PowerShell 5.1의 -Encoding utf8은 BOM을 붙입니다)
function Say($text) { Write-Host "`n▶ $text" -ForegroundColor Cyan }
function Do-Step($text, [scriptblock]$action) { if ($DryRun) { Write-Host "  (예행) $text" } else { Write-Host "  $text"; & $action } }
function Refresh-Path { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }
# 바깥 프로그램(node, git, npm, winget)은 실패해도 PowerShell이 멈추지 않으니 종료 코드를 직접 봅니다.
function Run($what, [scriptblock]$cmd) { & $cmd; if ($LASTEXITCODE -ne 0) { throw "$what 실패 (종료 코드 $LASTEXITCODE)" } }
function Write-Env($path, $text) { [IO.File]::WriteAllText($path, $text, $utf8) }
function Finish($code) { if ($Elevated) { Read-Host "`nEnter를 누르면 창이 닫힙니다" | Out-Null }; exit $code }

# 관리자 권한: 작업 스케줄러 등록(7단계)에 필요합니다.
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin -and -not $DryRun -and $StopAfter -ge 7) {
  Write-Host '관리자 권한이 필요합니다. 관리자 창으로 다시 엽니다 ("예"를 눌러 주세요)...' -ForegroundColor Yellow
  $relaunch = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$($MyInvocation.MyCommand.Path)`"", '-Elevated', '-Folder', "`"$Folder`"")
  if ($Machine) { $relaunch += @('-Machine', $Machine) }
  if ($OffsetMinutes -ge 0) { $relaunch += @('-OffsetMinutes', $OffsetMinutes) }
  if ($WithBot) { $relaunch += '-WithBot' }
  try { Start-Process powershell -Verb RunAs -ArgumentList $relaunch | Out-Null; exit 0 }
  catch { Write-Host '관리자 창을 열지 못했습니다. setup.bat을 오른쪽 클릭 → "관리자 권한으로 실행"으로 다시 해 주세요.' -ForegroundColor Red; exit 1 }
}

$step = 0
try {
  $step = 1; Say '1/8 이 PC 이름과 시작 시각'
  if (-not $Machine) { $Machine = Read-Host '이 PC 이름 (영문, 예: home / office / laptop)' }
  if ($Machine -notmatch '^[A-Za-z0-9_-]{2,20}$') { throw 'PC 이름은 영문·숫자·-·_ 2~20자로 해 주세요.' }
  if ($OffsetMinutes -lt 0) { $OffsetMinutes = [int](Read-Host '시작 시각을 몇 분 늦출까요? (첫 PC 0, 둘째 30, 셋째 60)') }
  # 단지·실거래 07:30 → 끝나면 온비드 → 끝나면 법원. 10:00·15:00은 앞 작업이 안 이어졌을 때의 예비 시각.
  $at = { param($m) (Get-Date -Hour 0 -Minute 0 -Second 0).AddMinutes($m + $OffsetMinutes) }
  Write-Host ("  {0}: 단지·실거래 {1:HH:mm} 시작 → 온비드 → 법원(월~토)이 이어서. 예비 시각 온비드 {2:HH:mm} · 법원 {3:HH:mm}" -f $Machine, (& $at 450), (& $at 600), (& $at 900))

  if ($StopAfter -ge 2) {
    $step = 2; Say '2/8 Node.js(24 이상)와 Git'
    Refresh-Path
    $node = Get-Command node -ErrorAction SilentlyContinue
    $nodeMajor = if ($node) { [int]((& node --version).TrimStart('v').Split('.')[0]) } else { 0 }
    if ($nodeMajor -lt 24) { Do-Step 'Node.js LTS 설치 (winget)' { Run 'Node 설치' { winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements }; Refresh-Path } }
    else { Write-Host "  Node $(& node --version) 있음" }
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Do-Step 'Git 설치 (winget)' { Run 'Git 설치' { winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements }; Refresh-Path } }
    else { Write-Host "  $(& git --version) 있음" }
  }

  if ($StopAfter -ge 3) {
    $step = 3; Say "3/8 코드 받기 → $Folder"
    if (Test-Path "$Folder\.git") { Do-Step '이미 있음 → 최신으로 (git pull --ff-only)' { Run 'git pull' { git -C $Folder pull --ff-only } } }
    else { Do-Step "git clone $Repo" { Run 'git clone' { git clone $Repo $Folder } } }
    # 바탕화면·USB에 둔 예전 설치 파일로 실행했으면, 방금 받은 코드 안의 최신 설치 파일로 넘어가 이어서 합니다.
    $latest = "$Folder\setup\setup.ps1"
    if (-not $DryRun -and (Test-Path $latest) -and ((Get-FileHash $latest).Hash -ne (Get-FileHash $MyInvocation.MyCommand.Path).Hash)) {
      Write-Host "  설치 파일이 바뀌었습니다 → 최신 설치 파일($latest)로 이어서 합니다" -ForegroundColor Yellow
      $next = @{ Machine = $Machine; OffsetMinutes = $OffsetMinutes; Folder = $Folder; Repo = $Repo; StopAfter = $StopAfter; EnvFrom = $(if ($EnvFrom) { $EnvFrom } else { "$here\.env.local" }) }
      if ($WithBot) { $next.WithBot = $true }; if ($Elevated) { $next.Elevated = $true }
      & $latest @next; exit $LASTEXITCODE
    }
  }

  if ($StopAfter -ge 4) {
    $step = 4; Say '4/8 비밀값 (.env.local)'
    $envTarget = "$Folder\.env.local"
    if (Test-Path $envTarget) { Write-Host '  이미 있음 → 덮어쓰지 않고 FACTORY_MACHINE 줄만 맞춥니다' }
    elseif ($EnvFrom -and (Test-Path $EnvFrom)) { Do-Step '처음 설치 파일 옆의 .env.local 복사' { Copy-Item $EnvFrom $envTarget } }
    elseif (Test-Path "$here\.env.local") { Do-Step '설치 파일 옆의 .env.local 복사' { Copy-Item "$here\.env.local" $envTarget } }
    elseif ($DryRun) { Write-Host '  (예행) .env.local 붙여 넣기 받기' }
    else {
      Write-Host '  .env.local 내용을 붙여 넣고, 빈 줄에서 Enter를 두 번 누르세요.'
      $lines = @(); while ($true) { $l = Read-Host; if ($l -eq '' -and $lines.Count -and $lines[-1] -eq '') { break }; $lines += $l }
      Write-Env $envTarget ((($lines -join "`n").Trim()) + "`n")
    }
    if (-not $DryRun) {
      # BOM 없이 다시 씁니다. 이미 붙어 있던 BOM(메모장·PowerShell이 붙인 것)도 이때 떨어집니다.
      $content = [IO.File]::ReadAllText($envTarget, $utf8).TrimStart([char]0xFEFF)
      if ($content -match '(?m)^FACTORY_MACHINE=') { $content = $content -replace '(?m)^FACTORY_MACHINE=.*$', "FACTORY_MACHINE=$Machine" }
      else { $content = $content.TrimEnd() + "`nFACTORY_MACHINE=$Machine`n" }
      Write-Env $envTarget $content
      # Node가 실제로 읽을 수 있는지 확인합니다 (값은 화면에 나오지 않습니다).
      Push-Location $Folder
      try { Run '.env.local 확인' { node scripts/daily/env.mjs --check NEXT_PUBLIC_SUPABASE_URL SUPABASE_SECRET_KEY TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID FACTORY_MACHINE } }
      finally { Pop-Location }
    }
    Write-Host "  FACTORY_MACHINE=$Machine"
  }

  if ($StopAfter -ge 5) {
    $step = 5; Say '5/8 패키지 설치 (npm ci, 법원 수집은 Windows에 있는 Edge를 씁니다)'
    Do-Step 'npm ci' { Push-Location $Folder; try { Run 'npm ci' { npm ci --no-audit --no-fund } } finally { Pop-Location } }
  }

  if ($StopAfter -ge 6) {
    $step = 6; Say '6/8 수집 기록 내려받기 (약 1.3GB, 처음 한 번)'
    Do-Step 'node scripts/daily/bundle.mjs download' { Push-Location $Folder; try { Run '기록 내려받기' { node scripts/daily/bundle.mjs download } } finally { Pop-Location } }
  }

  if ($StopAfter -ge 7) {
    $step = 7; Say '7/8 작업 스케줄러 등록 (\LineAuction\) + 바탕화면 바로가기'
    $vbs = "$Folder\scripts\daily\run-hidden.vbs"
    $tasks = @(
      @{ Name = 'Market Daily'; Args = "`"$vbs`" market schedule"; Trigger = { New-ScheduledTaskTrigger -Daily -At (& $at 450) } },
      @{ Name = 'Onbid Daily'; Args = "`"$vbs`" onbid schedule"; Trigger = { New-ScheduledTaskTrigger -Daily -At (& $at 600) } },
      @{ Name = 'Court Daily'; Args = "`"$vbs`" court schedule"; Trigger = { New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday, Tuesday, Wednesday, Thursday, Friday, Saturday -At (& $at 900) } },
      @{ Name = 'Watch every 10min'; Args = "`"$Folder\scripts\daily\watch-hidden.vbs`""; Trigger = { New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Minutes 10) } }
    )
    if ($WithBot) { $tasks += @{ Name = 'Telegram Bot every 1min'; Args = "`"$Folder\scripts\alerts\bot-hidden.vbs`""; Trigger = { New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1) } } }
    foreach ($t in $tasks) {
      Do-Step "등록: $($t.Name)" {
        $triggers = @(& $t.Trigger)
        # 켜거나 로그인할 때도 한 번: 정해진 시각 전이면 실행기가 스스로 끝납니다.
        if ($t.Name -notlike '*every*') { $triggers += New-ScheduledTaskTrigger -AtLogOn }
        $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 12) -MultipleInstances IgnoreNew
        Register-ScheduledTask -TaskPath '\LineAuction\' -TaskName $t.Name -Action (New-ScheduledTaskAction -Execute 'wscript.exe' -Argument $t.Args -WorkingDirectory $Folder) -Trigger $triggers -Settings $settings -Force | Out-Null
      }
    }
    # 바탕화면 바로가기: 진행 상황 보기(읽기 전용), 온비드·법원 지금 실행. 다시 설치하면 같은 것으로 바뀝니다.
    $desktop = [Environment]::GetFolderPath('Desktop')
    $links = @(
      @{ Name = '선경매 진행 상황 보기'; Target = "$env:SystemRoot\System32\cmd.exe"; Args = '/k "title 선경매 진행 상황 & chcp 65001 >nul & node scripts\daily\status.mjs --watch"'; Icon = 'shell32.dll,22' },
      @{ Name = '선경매 온비드 지금 실행'; Target = "$env:SystemRoot\System32\wscript.exe"; Args = "`"$vbs`" onbid manual"; Icon = 'shell32.dll,137' },
      @{ Name = '선경매 법원 지금 실행'; Target = "$env:SystemRoot\System32\wscript.exe"; Args = "`"$vbs`" court manual"; Icon = 'shell32.dll,137' }
    )
    foreach ($l in $links) {
      Do-Step "바로가기: $($l.Name)" {
        $s = (New-Object -ComObject WScript.Shell).CreateShortcut("$desktop\$($l.Name).lnk")
        $s.TargetPath = $l.Target; $s.Arguments = $l.Args; $s.WorkingDirectory = $Folder; $s.IconLocation = $l.Icon; $s.Save()
      }
    }
  }

  if ($StopAfter -ge 8) {
    $step = 8; Say '8/8 연결 확인 + 텔레그램 "등록 완료"'
    Do-Step '저장소·잠금 표 확인 후 알림' {
      Push-Location $Folder
      try {
        Run '기록 상태 확인' { node scripts/daily/bundle.mjs status }
        Run '잠금 표·텔레그램 확인' { node --input-type=module -e "const {db,notifyOperator}=await import('./scripts/daily/factory.mjs');const {error}=await db.from('factory_job_leases').select('job').limit(1);if(error)throw Error(error.message);const r=await notifyOperator('<b>✅ $Machine 등록 완료</b>\n데이터 공장 PC로 등록됐습니다. 시작 시각 +$OffsetMinutes분. 켜져 있으면 그날 작업을 맡습니다.');if(!r.ok)throw Error('텔레그램: '+r.description);console.log('  텔레그램 보냄');" }
      } finally { Pop-Location }
    }
  }
}
catch {
  Write-Host "`n실패: $step/8 단계 — $($_.Exception.Message)" -ForegroundColor Red
  Write-Host '고친 뒤 setup.bat을 다시 실행하면 됩니다 (이미 된 단계는 그대로 둡니다).'
  Finish 1
}

if ($StopAfter -lt 8) { Write-Host "`n$StopAfter/8 단계까지 마침 (시험)." -ForegroundColor Green; Finish 0 }
Write-Host "`n완료: 8/8 단계 모두 성공." -ForegroundColor Green
Write-Host '절전 끄기(권장): 설정 → 시스템 → 전원 → 화면과 절전 → "절전 모드 전환"을 "안 함"으로.'
Write-Host '  또는 관리자 PowerShell에서:  powercfg /change standby-timeout-ac 0'
Write-Host "기록은 $Folder\data, 실행 기록은 $Folder\data\daily\runs.jsonl 에 남습니다."
Finish 0
