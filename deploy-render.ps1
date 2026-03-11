# Deploy DividendFlow PK to Render
# Loads RENDER_API_KEY from api-keys.txt if not set. Or set env var directly.

$ErrorActionPreference = "Stop"
if (-not $env:RENDER_API_KEY -and (Test-Path (Join-Path $PSScriptRoot "api-keys.txt"))) {
    Get-Content (Join-Path $PSScriptRoot "api-keys.txt") | ForEach-Object {
        if ($_ -match '^\s*RENDER_API_KEY=(.+)$') { $env:RENDER_API_KEY = $matches[1].Trim() }
    }
}
$toDeploy = @("dividendflow-frontend", "dividendflow-backend", "dividendflow-news")
$deployed = 0

if ($env:RENDER_API_KEY) {
    Write-Host "=== Deploying via Render API ===" -ForegroundColor Cyan
    $headers = @{
        "Authorization" = "Bearer $env:RENDER_API_KEY"
        "Accept"        = "application/json"
        "Content-Type"  = "application/json"
    }
    try {
        $resp = Invoke-RestMethod -Uri "https://api.render.com/v1/services?limit=100" -Headers $headers -Method Get
        $services = if ($resp -is [array]) { $resp } else { @($resp) }
        foreach ($name in $toDeploy) {
            $svc = $services | Where-Object { ($_.name -eq $name) -or ($_.service.name -eq $name) } | Select-Object -First 1
            $id = if ($svc.service) { $svc.service.id } else { $svc.id }
            if ($id) {
                Write-Host "Deploying $name ($id)..." -ForegroundColor Green
                Invoke-RestMethod -Uri "https://api.render.com/v1/services/$id/deploys" -Headers $headers -Method Post -Body "{}" | Out-Null
                $deployed++
            } else {
                Write-Host "$name not found" -ForegroundColor Yellow
            }
        }
    } catch {
        Write-Host "API error: $_" -ForegroundColor Red
        exit 1
    }
} else {
    $RenderExe = Join-Path $PSScriptRoot "render-cli\cli_v2.12.0.exe"
    if (-not (Test-Path $RenderExe)) {
        Write-Host "Downloading Render CLI..." -ForegroundColor Yellow
        Invoke-WebRequest -Uri "https://github.com/render-oss/cli/releases/download/v2.12.0/cli_2.12.0_windows_amd64.zip" -OutFile "$env:TEMP\render-cli.zip" -UseBasicParsing
        New-Item -ItemType Directory -Path (Join-Path $PSScriptRoot "render-cli") -Force | Out-Null
        Expand-Archive -Path "$env:TEMP\render-cli.zip" -DestinationPath (Join-Path $PSScriptRoot "render-cli") -Force
    }
    $servicesJson = & $RenderExe services -o json --confirm 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`nSet RENDER_API_KEY, or run: .\render-cli\cli_v2.12.0.exe login" -ForegroundColor Yellow
        Write-Host "Then: .\render-cli\cli_v2.12.0.exe workspace set" -ForegroundColor Yellow
        exit 1
    }
    $services = $servicesJson | ConvertFrom-Json
    if ($services -isnot [array]) { $services = @($services) }
    foreach ($name in $toDeploy) {
        $svc = $services | Where-Object { $_.name -eq $name }
        if ($svc) {
            Write-Host "Deploying $name..." -ForegroundColor Green
            & $RenderExe deploys create $svc.id -o text --confirm
            if ($LASTEXITCODE -eq 0) { $deployed++ }
        }
    }
}

Write-Host "`n=== Done. Triggered $deployed deploy(s). ===" -ForegroundColor Cyan
