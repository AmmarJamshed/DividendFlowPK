# Trigger PSX Market Closing Prices GitHub Actions workflow
# Requires: GITHUB_TOKEN in api-keys.txt or env (scope: repo)
# Or run manually: https://github.com/AmmarJamshed/DividendFlowPK/actions/workflows/psx-market-prices.yml

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
if (-not $env:GITHUB_TOKEN -and (Test-Path (Join-Path $root "api-keys.txt"))) {
    Get-Content (Join-Path $root "api-keys.txt") | ForEach-Object {
        if ($_ -match 'GITHUB_TOKEN=\s*(.+)' -and $matches[1].Trim()) { $env:GITHUB_TOKEN = $matches[1].Trim() }
    }
}

if (-not $env:GITHUB_TOKEN) {
    Write-Host "GITHUB_TOKEN not set. Add to api-keys.txt or set env var." -ForegroundColor Yellow
    Write-Host "Or trigger manually: https://github.com/AmmarJamshed/DividendFlowPK/actions/workflows/psx-market-prices.yml" -ForegroundColor Cyan
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $env:GITHUB_TOKEN"
    "Accept"       = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
}

Write-Host "Triggering PSX Market Closing Prices workflow..." -ForegroundColor Cyan
try {
    $body = '{"ref":"main"}'
    $r = Invoke-RestMethod -Uri "https://api.github.com/repos/AmmarJamshed/DividendFlowPK/actions/workflows/psx-market-prices.yml/dispatches" `
        -Method Post -Headers $headers -Body $body -ContentType "application/json"
    Write-Host "Workflow triggered successfully." -ForegroundColor Green
} catch {
    Write-Host "Failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`nWaiting 15s for run to start, then checking status..." -ForegroundColor Cyan
Start-Sleep -Seconds 15

$runs = Invoke-RestMethod -Uri "https://api.github.com/repos/AmmarJamshed/DividendFlowPK/actions/workflows/245912780/runs?per_page=1" -Headers $headers
$run = $runs.workflow_runs[0]
if ($run) {
    Write-Host "Run: $($run.html_url)" -ForegroundColor Cyan
    Write-Host "Status: $($run.status) | Conclusion: $($run.conclusion)" -ForegroundColor $(if ($run.conclusion -eq 'success') { 'Green' } elseif ($run.conclusion -eq 'failure') { 'Red' } else { 'Yellow' })
} else {
    Write-Host "No run found yet. Check: https://github.com/AmmarJamshed/DividendFlowPK/actions" -ForegroundColor Yellow
}
