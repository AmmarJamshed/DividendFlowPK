# Deploy DividendFlow PK to Render via CLI
# First-time setup:
#   1. .\render-cli\cli_v2.12.0.exe login   (complete in browser)
#   2. .\render-cli\cli_v2.12.0.exe workspace set   (select your workspace)
# For CI: set RENDER_API_KEY env var (create at https://dashboard.render.com/u/settings#api-keys)

$ErrorActionPreference = "Stop"
$RenderExe = Join-Path $PSScriptRoot "render-cli\cli_v2.12.0.exe"

if (-not (Test-Path $RenderExe)) {
    Write-Host "Downloading Render CLI..." -ForegroundColor Yellow
    $url = "https://github.com/render-oss/cli/releases/download/v2.12.0/cli_2.12.0_windows_amd64.zip"
    $zip = Join-Path $env:TEMP "render-cli.zip"
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
    New-Item -ItemType Directory -Path (Join-Path $PSScriptRoot "render-cli") -Force | Out-Null
    Expand-Archive -Path $zip -DestinationPath (Join-Path $PSScriptRoot "render-cli") -Force
}

Write-Host "=== Validating render.yaml ===" -ForegroundColor Cyan
& $RenderExe blueprints validate render.yaml
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n=== Listing Render services ===" -ForegroundColor Cyan
$servicesJson = & $RenderExe services -o json --confirm 2>&1
if ($LASTEXITCODE -ne 0) {
    if ($servicesJson -match "login") {
        Write-Host "`nPlease run: .\render-cli\cli_v2.12.0.exe login" -ForegroundColor Yellow
        Write-Host "Complete auth in browser, then run this script again." -ForegroundColor Yellow
    } elseif ($servicesJson -match "workspace") {
        Write-Host "`nPlease run: .\render-cli\cli_v2.12.0.exe workspace set" -ForegroundColor Yellow
        Write-Host "Select your workspace, then run this script again." -ForegroundColor Yellow
    }
    exit 1
}

$services = $servicesJson | ConvertFrom-Json
if ($services -isnot [array]) { $services = @($services) }
$toDeploy = @("dividendflow-frontend", "dividendflow-backend", "dividendflow-news")
$deployed = 0

foreach ($name in $toDeploy) {
    $svc = $services | Where-Object { $_.name -eq $name }
    if ($svc) {
        Write-Host "`nDeploying $name ($($svc.id))..." -ForegroundColor Green
        & $RenderExe deploys create $svc.id -o text --confirm
        if ($LASTEXITCODE -eq 0) { $deployed++ }
    } else {
        Write-Host "`n$name not found. Sync Blueprint: Dashboard > Blueprint > Sync" -ForegroundColor Yellow
    }
}

Write-Host "`n=== Done. Deployed $deployed service(s). ===" -ForegroundColor Cyan
Write-Host "Set env vars for dividendflow-news: GROQ_API_KEY, GITHUB_TOKEN (Dashboard > dividendflow-news > Environment)" -ForegroundColor Yellow
