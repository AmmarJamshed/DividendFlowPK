# Deploy DividendFlow PK to Render
# Loads RENDER_API_KEY from api-keys.txt if not set. Or set env var directly.

$ErrorActionPreference = "Stop"
if (-not $env:RENDER_API_KEY -and (Test-Path (Join-Path $PSScriptRoot "api-keys.txt"))) {
    Get-Content (Join-Path $PSScriptRoot "api-keys.txt") | ForEach-Object {
        if ($_ -match '^\s*RENDER_API_KEY=(.+)$') { $env:RENDER_API_KEY = $matches[1].Trim() }
    }
}
# All Blueprint services from render.yaml (web + cron)
$toDeploy = @(
    "dividendflow-frontend",
    "dividendflow-backend",
    "dividendflow-scraper",
    "dividendflow-news",
    "dividendflow-nccpl-scraper",
    "dividendflow-health-check"
)
$deployed = 0

# DividendFlow crons: weekdays only (Mon–Fri UTC), matches render.yaml — skip weekend runs to save compute
$cronSchedules = @(
    @{ Name = "dividendflow-scraper";       Schedule = "0 11 * * 1-5" }
    @{ Name = "dividendflow-news";          Schedule = "0 12 * * 1-5" }
    @{ Name = "dividendflow-nccpl-scraper"; Schedule = "30 12 * * 1-5" }
    @{ Name = "dividendflow-health-check";  Schedule = "0 0,6,12,18 * * 1-5" }
)

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

        Write-Host "`n--- Syncing DividendFlow cron schedules (weekdays only) ---" -ForegroundColor Cyan
        foreach ($row in $cronSchedules) {
            $cronName = $row.Name
            $want = $row.Schedule
            $wrap = $services | Where-Object { $_.service.name -eq $cronName } | Select-Object -First 1
            if (-not $wrap) {
                Write-Host "Cron $cronName not found in service list" -ForegroundColor Yellow
                continue
            }
            $sid = $wrap.service.id
            $cur = $wrap.service.serviceDetails.schedule
            if ($cur -eq $want) {
                Write-Host "$cronName already $want" -ForegroundColor DarkGray
                continue
            }
            Write-Host "PATCH $cronName schedule: '$cur' -> '$want'" -ForegroundColor Green
            $patchBody = @{ serviceDetails = @{ schedule = $want } } | ConvertTo-Json -Compress
            Invoke-RestMethod -Uri "https://api.render.com/v1/services/$sid" -Headers $headers -Method Patch -Body $patchBody | Out-Null
        }

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
