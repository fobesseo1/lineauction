$ErrorActionPreference = 'Stop'
$env:GCM_INTERACTIVE = 'Never'
$credentialLines = "protocol=https`nhost=github.com`n`n" | git credential fill
if ($LASTEXITCODE -ne 0) { throw 'GitHub credential unavailable' }
$credentialFields = @{}
foreach ($line in $credentialLines) { if ($line -match '^([^=]+)=(.*)$') { $credentialFields[$matches[1]] = $matches[2] } }
$headers = @{ Authorization = "Bearer $($credentialFields.password)"; Accept = 'application/vnd.github+json'; 'X-GitHub-Api-Version' = '2022-11-28' }
function Invoke-GitHub($method, $path, $body = $null) {
    $parameters = @{ Method = $method; Uri = "https://api.github.com$path"; Headers = $headers }
    if ($null -ne $body) { $parameters.Body = ($body | ConvertTo-Json -Depth 8 -Compress); $parameters.ContentType = 'application/json' }
    Invoke-RestMethod @parameters
}
try {
    $account = Invoke-GitHub GET '/user'
    if ($account.login -ne 'fobesseo1') { throw 'GitHub account does not match requested site' }
    try { $repository = Invoke-GitHub GET '/repos/fobesseo1/lineauction' }
    catch { if ([int]$_.Exception.Response.StatusCode -ne 404) { throw }; $repository = Invoke-GitHub POST '/user/repos' @{ name = 'lineauction'; description = '선경매 · 서울 경기 법원경매와 국토부 실거래 조회'; private = $false; auto_init = $false } }
    foreach ($name in @('NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')) {
        $line = Get-Content .env.local | Where-Object { $_ -match "^$name=" } | Select-Object -First 1
        if (-not $line) { throw "Missing public setting $name" }
        $value = ($line -split '=', 2)[1].Trim().Trim('"').Trim("'")
        if ($name -like '*KEY' -and $value -notlike 'sb_publishable_*') { throw 'Only a publishable key may be configured' }
        try { Invoke-GitHub GET "/repos/fobesseo1/lineauction/actions/variables/$name" | Out-Null; Invoke-GitHub PATCH "/repos/fobesseo1/lineauction/actions/variables/$name" @{ name = $name; value = $value } | Out-Null }
        catch { if ([int]$_.Exception.Response.StatusCode -ne 404) { throw }; Invoke-GitHub POST '/repos/fobesseo1/lineauction/actions/variables' @{ name = $name; value = $value } | Out-Null }
    }
    try { $pages = Invoke-GitHub GET '/repos/fobesseo1/lineauction/pages' }
    catch { if ([int]$_.Exception.Response.StatusCode -ne 404) { throw }; $pages = Invoke-GitHub POST '/repos/fobesseo1/lineauction/pages' @{ build_type = 'workflow' } }
    [pscustomobject]@{ repository = $repository.html_url; pages = $pages.html_url; configured = $true } | ConvertTo-Json
} finally { $credentialFields.Clear(); $credentialLines = $null; $headers.Clear() }
