$ErrorActionPreference = 'Stop'
$taskWorkspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$taskData = Join-Path $taskWorkspace 'data\court\standalone'
New-Item -ItemType Directory -Path $taskData -Force | Out-Null
if (Test-Path -LiteralPath (Join-Path $taskData 'monitor.lock')) { throw 'Monitor lock exists. Check the recorded process before starting another observer.' }
$taskNode = (Get-Command node -ErrorAction Stop).Source
$taskProcess = Start-Process -FilePath $taskNode -ArgumentList @('scripts/court/monitor.mjs') -WorkingDirectory $taskWorkspace -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskData 'monitor.stdout.log') -RedirectStandardError (Join-Path $taskData 'monitor.stderr.log') -PassThru
Write-Output "Independent observer started. PID: $($taskProcess.Id). No collector or schedule was started."
