param([Parameter(Mandatory=$true)][string]$PayloadPath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$taskPayload = [IO.File]::ReadAllText($PayloadPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
function Write-Receipt([string]$Status) {
    $taskReceipt = @{ status=$Status; at=[DateTime]::UtcNow.ToString('o') } | ConvertTo-Json -Compress
    [IO.File]::WriteAllText($taskPayload.receiptPath, $taskReceipt, [Text.UTF8Encoding]::new($false))
}
$taskIcon = New-Object System.Windows.Forms.NotifyIcon
$taskIcon.Icon = [Drawing.SystemIcons]::Warning
$taskIcon.Text = 'Line Auction'
$taskIcon.BalloonTipTitle = $taskPayload.title
$taskIcon.BalloonTipText = $taskPayload.message
$taskIcon.BalloonTipIcon = [Windows.Forms.ToolTipIcon]::Warning
$taskIcon.add_BalloonTipShown({ Write-Receipt 'shown' })
$taskIcon.add_BalloonTipClicked({ Start-Process 'http://127.0.0.1:3000/settings' })
$taskTimer = New-Object System.Windows.Forms.Timer
$taskTimer.Interval = 20000
$taskTimer.add_Tick({ [Windows.Forms.Application]::ExitThread() })
try {
    $taskIcon.Visible = $true
    Write-Receipt 'submitted'
    $taskIcon.ShowBalloonTip(15000)
    $taskTimer.Start()
    [Windows.Forms.Application]::Run()
} finally {
    $taskTimer.Stop()
    $taskTimer.Dispose()
    $taskIcon.Visible = $false
    $taskIcon.Dispose()
}
