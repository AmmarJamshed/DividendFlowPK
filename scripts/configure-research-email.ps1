#Requires -Version 5.1
<#
.SYNOPSIS
  Sets RESEND_API_KEY (+ RESEND_FROM) on Render dividendflow-backend safely (one key at a time).

.EXAMPLE
  $env:RENDER_API_KEY = 'rnd_...'
  .\scripts\configure-research-email.ps1
#>
param(
  [string]$ResendApiKey = '',
  [string]$ServiceName = 'dividendflow-backend',
  [string]$ResendFrom = 'DividendFlow PK <noreply@psxbluechips.com>'
)

$ErrorActionPreference = 'Stop'

if (-not $ResendApiKey) {
  $envFile = 'D:\psx-blue-chip-report\.env'
  if (Test-Path $envFile) {
    $line = Get-Content $envFile | Where-Object { $_ -match '^RESEND_API_KEY=' } | Select-Object -First 1
    if ($line) { $ResendApiKey = ($line -split '=', 2)[1].Trim().Trim('"').Trim("'") }
  }
}

if (-not $ResendApiKey) { throw 'RESEND_API_KEY not found. Pass -ResendApiKey or set it in psx-blue-chip-report\.env' }

if (-not $env:RENDER_API_KEY) {
  Write-Host @"
RENDER_API_KEY is not set.

1) Open https://dashboard.render.com/u/settings#api-keys and create an API key
2) In PowerShell:  `$env:RENDER_API_KEY = 'rnd_...'`
3) Re-run:  .\scripts\configure-research-email.ps1

Or paste manually in Render → $ServiceName → Environment:
  RESEND_API_KEY = (your re_ key)
  RESEND_FROM    = $ResendFrom
Then Manual Deploy → Deploy latest commit.

Also add RESEND_API_KEY under Supabase → Edge Functions → Secrets:
  https://supabase.com/dashboard/project/dbkytlsejpxmclpznudk/settings/functions
"@
  exit 2
}

$headers = @{
  Authorization = "Bearer $($env:RENDER_API_KEY)"
  Accept        = 'application/json'
  'Content-Type' = 'application/json'
}

Write-Host "Looking up Render service '$ServiceName'..."
$services = Invoke-RestMethod -Headers $headers -Uri 'https://api.render.com/v1/services?limit=50'
$svc = @($services | ForEach-Object { $_.service } | Where-Object { $_.name -eq $ServiceName }) | Select-Object -First 1
if (-not $svc) { throw "Service '$ServiceName' not found on this Render account." }

$serviceId = $svc.id
Write-Host "Found $ServiceName ($serviceId). Updating env vars one key at a time..."

function Set-RenderEnv([string]$Key, [string]$Value) {
  $uri = "https://api.render.com/v1/services/$serviceId/env-vars/$Key"
  $payload = @{ value = $Value } | ConvertTo-Json
  Invoke-RestMethod -Method Put -Headers $headers -Uri $uri -Body $payload | Out-Null
  Write-Host "  set $Key"
}

Set-RenderEnv -Key 'RESEND_API_KEY' -Value $ResendApiKey
Set-RenderEnv -Key 'RESEND_FROM' -Value $ResendFrom

Write-Host "Triggering deploy..."
try {
  Invoke-RestMethod -Method Post -Headers $headers -Uri "https://api.render.com/v1/services/$serviceId/deploys" -Body '{}' | Out-Null
  Write-Host "Deploy started."
} catch {
  Write-Host "Deploy trigger note: $($_.Exception.Message) (env vars are saved; restart/deploy from dashboard if needed)"
}

Write-Host @"

Render email env configured.

Also set RESEND_API_KEY on Supabase Edge secrets (fallback path):
  https://supabase.com/dashboard/project/dbkytlsejpxmclpznudk/settings/functions

Note: noreply@dividendflow.pk is not verified on this Resend account.
Using RESEND_FROM=$ResendFrom until you verify dividendflow.pk in Resend.
"@
