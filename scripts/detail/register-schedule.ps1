# Registers the complex-detail collection: every day at 07:00 and at logon (also after a missed 07:00, e.g. the PC slept).
# schedule.mjs decides what each start does: at most one run a day, and from 07:30 on only after the market job.
#   powershell -ExecutionPolicy Bypass -File scripts/detail/register-schedule.ps1
$root = (Resolve-Path "$PSScriptRoot\..\..").Path
$a = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$root\scripts\detail\schedule-hidden.vbs`"" -WorkingDirectory $root
$t = @((New-ScheduledTaskTrigger -Daily -At "07:00"), (New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME))
$s = New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 12)
$p = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskPath "\LineAuction\" -TaskName "Detail Daily 7am" -Action $a -Trigger $t -Settings $s -Principal $p -Force | Out-Null
$i = Get-ScheduledTask -TaskPath "\LineAuction\" -TaskName "Detail Daily 7am" | Get-ScheduledTaskInfo
"registered, next run: $($i.NextRunTime)"
