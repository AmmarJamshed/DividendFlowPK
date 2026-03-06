# DividendFlow PK - Deploy to GitHub and Render
# Run this script from d:\DividendFlowPK

$ErrorActionPreference = "Continue"
$ghPath = "D:\DevStorage\Temp\gh\bin\gh.exe"

Write-Host "=== DividendFlow PK Deploy ===" -ForegroundColor Cyan

# 1. GitHub: Create repo and push
Write-Host "`n[1/3] GitHub - Creating repo and pushing..." -ForegroundColor Yellow
$authOut = & $ghPath auth status 2>&1; $authOk = $LASTEXITCODE -eq 0
if (-not $authOk) {
    Write-Host "GitHub CLI not logged in. Running: gh auth login" -ForegroundColor Yellow
    Write-Host "Complete the browser login (enter code at github.com/login/device), then run this script again." -ForegroundColor Yellow
    & $ghPath auth login -h github.com -p https -w
    exit 0
}

$repoName = "DividendFlowPK"
$createResult = & $ghPath repo create $repoName --public --source=. --remote=origin --push 2>&1
if ($LASTEXITCODE -eq 0) {
    $login = & $ghPath api user -q .login 2>$null
    Write-Host "Repo created and pushed: https://github.com/$login/$repoName" -ForegroundColor Green
} else {
    # Repo may already exist - try push only
    if ($createResult -match "already exists") {
        git remote add origin "https://github.com/$((& $ghPath api user -q .login))/$repoName.git" 2>$null
        git push -u origin main
        Write-Host "Pushed to existing repo." -ForegroundColor Green
    } else {
        Write-Host "GitHub step failed. Create repo manually at https://github.com/new" -ForegroundColor Red
        Write-Host $createResult
        exit 1
    }
}

# 2. Render: One-time Blueprint connect (instructions)
Write-Host "`n[2/3] Render - Initial setup (one-time):" -ForegroundColor Yellow
Write-Host "  1. Go to https://dashboard.render.com" -ForegroundColor White
Write-Host "  2. New > Blueprint" -ForegroundColor White
Write-Host "  3. Connect GitHub, select DividendFlowPK repo" -ForegroundColor White
Write-Host "  4. Set GROQ_API_KEY (backend) and REACT_APP_API_URL (frontend)" -ForegroundColor White
Write-Host "  5. Click Apply" -ForegroundColor White

# 3. Render CLI deploy (via WSL)
Write-Host "`n[3/3] Render CLI deploy (after Blueprint is connected):" -ForegroundColor Yellow
Write-Host "  Run: wsl -e bash -c 'cd /mnt/d/DividendFlowPK && ./deploy-render.sh'" -ForegroundColor White
Write-Host "`nDone. See DEPLOY.md for full instructions." -ForegroundColor Cyan
