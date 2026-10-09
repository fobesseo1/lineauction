param([switch]$RepairPass)
$ErrorActionPreference = 'Stop'
$taskWorkspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$taskData = Join-Path $taskWorkspace 'data\court\standalone'
New-Item -ItemType Directory -Path $taskData -Force | Out-Null
if (Test-Path -LiteralPath (Join-Path $taskData 'running.lock')) {
  throw 'Collector lock exists. Check its process before starting another collector.'
}
if (Test-Path -LiteralPath (Join-Path $taskData 'STOP')) {
  throw 'STOP file exists. Remove it only when deliberately resuming initial collection.'
}
$taskNode = (Get-Command node -ErrorAction Stop).Source
$taskLogStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$taskArguments = @('scripts/court/standalone.mjs','--limit=100000','--sync-every=100')
if ($RepairPass) { $taskArguments += '--repair-pass' }
$taskProcess = Start-Process -FilePath $taskNode -ArgumentList $taskArguments -WorkingDirectory $taskWorkspace -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskData "$taskLogStamp.stdout.log") -RedirectStandardError (Join-Path $taskData "$taskLogStamp.stderr.log") -PassThru
Set-Content -LiteralPath (Join-Path $taskData 'launcher-pid.txt') -Value $taskProcess.Id
Write-Output "Initial collector started. PID: $($taskProcess.Id). No recurring schedule was created."
