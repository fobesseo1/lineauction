# Registers the complex-detail morning collection: every day at 07:00, ending by 07:30 before the market job.
# A missed start is not caught up later, so it cannot overlap that job; the next morning continues from the caches.
#   powershell -ExecutionPolicy Bypass -File scripts/detail/register-schedule.ps1
$root = (Resolve-Path "$PSScriptRoot\..\..").Path
$a = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$root\scripts\detail\schedule-hidden.vbs`"" -WorkingDirectory $root
$t = New-ScheduledTaskTrigger -Daily -At "07:00"
$s = New-ScheduledTaskSettingsSet -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 3)
$p = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskPath "\LineAuction\" -TaskName "Detail Daily 7am" -Action $a -Trigger $t -Settings $s -Principal $p -Force | Out-Null
$i = Get-ScheduledTask -TaskPath "\LineAuction\" -TaskName "Detail Daily 7am" | Get-ScheduledTaskInfo
"registered, next run: $($i.NextRunTime)"
