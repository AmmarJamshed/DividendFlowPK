# NCCPL Risk Data Automation Setup

## Problem
NCCPL website (www.nccpl.com.pk/market-information) uses Cloudflare protection that blocks headless browser automation, preventing automated daily scraping of VAR Margins data.

## Solution: Browserless.io Integration

Use Browserless.io - a cloud browser service that bypasses Cloudflare automatically.

### Step 1: Get Browserless.io Account

1. Go to https://www.browserless.io/
2. Sign up for free account (1,000 requests/month free tier)
3. Get your API token from dashboard
4. Add to Render environment variables as `BROWSERLESS_TOKEN`

### Step 2: Configure Render Cron Job

Already configured in `render.yaml`:

```yaml
- type: cron
  runtime: python
  name: dividendflow-nccpl-scraper
  schedule: "30 12 * * *"  # 5:30 PM PKT daily
  buildCommand: pip install -r requirements-scraper.txt && playwright install chromium
  startCommand: python scripts/scrape-nccpl-browserless.py
  envVars:
    - key: BROWSERLESS_TOKEN
    - key: GITHUB_TOKEN
    - key: GITHUB_REPO
```

### Step 3: Add Environment Variables to Render

In Render Dashboard:
1. Go to `dividendflow-nccpl-scraper` cron job
2. Add environment variables:
   - `BROWSERLESS_TOKEN`: Your Browserless.io API token
   - `GITHUB_TOKEN`: GitHub personal access token (for auto-commit)
   - `GITHUB_REPO`: `AmmarJamshed/DividendFlowPK`

### Step 4: Deploy

Push changes to GitHub:

```bash
git add .
git commit -m "Add NCCPL automated scraper with Browserless.io"
git push origin main
```

Render will automatically:
1. Create the new cron job
2. Run daily at 5:30 PM PKT
3. Scrape NCCPL data via Browserless
4. Update `data/risk/nccpl_risk_metrics.csv`
5. Commit and push to GitHub
6. Trigger frontend/backend redeployment with fresh data

## How It Works

1. **Browserless Connection**: Script connects to Browserless.io cloud browser
2. **Cloudflare Bypass**: Browserless automatically handles Cloudflare challenges
3. **Data Extraction**: Script navigates to VAR Margins tab and extracts table data
4. **Symbol Aggregation**: Cleans symbols (removes -CAPRN1 suffixes) and aggregates by base symbol
5. **CSV Generation**: Creates `nccpl_risk_metrics.csv` with 550+ PSX symbols
6. **Git Push**: Commits and pushes to GitHub (triggers Render redeployment)

## Files

- `scripts/scrape-nccpl-browserless.py` - Main scraper using Browserless.io
- `scripts/process-nccpl-export.py` - Manual processing script (backup)
- `requirements-scraper.txt` - Python dependencies for scraper
- `data/risk/nccpl_risk_metrics.csv` - Output file with risk metrics

## Manual Fallback

If Browserless.io is unavailable:

1. Visit https://www.nccpl.com.pk/market-information
2. Click "VAR Margins" tab
3. Click "Export" button (downloads `var-margins.csv`)
4. Run: `python scripts/process-nccpl-export.py`
5. Commit and push: `git add data/risk/nccpl_risk_metrics.csv && git commit -m "Update NCCPL data" && git push`

## Cost

- **Browserless.io Free Tier**: 1,000 requests/month (sufficient for daily scraping)
- **Render Cron Job**: Free tier includes cron jobs
- **Total**: $0/month

## Monitoring

Check cron job logs in Render dashboard:
- Go to `dividendflow-nccpl-scraper`
- View "Logs" tab
- Look for: `[NCCPL] ✓ Success: XXX symbols scraped`

## Data Flow

```
NCCPL Website
    ↓ (via Browserless.io)
Render Cron Job (scrape-nccpl-browserless.py)
    ↓
data/risk/nccpl_risk_metrics.csv
    ↓ (git push)
GitHub Repository
    ↓ (webhook trigger)
Render Backend Redeploy
    ↓
API serves fresh risk data
    ↓
Frontend displays updated risk indicators
```

## Testing Locally

To test the scraper locally (requires Browserless token):

```bash
export BROWSERLESS_TOKEN="your_token_here"
python scripts/scrape-nccpl-browserless.py
```

## Alternative: Browserless.io API

If Playwright connection fails, can also use Browserless HTTP API:

```python
import requests

response = requests.post(
    f'https://chrome.browserless.io/content?token={BROWSERLESS_TOKEN}',
    json={
        'url': 'https://www.nccpl.com.pk/market-information',
        'waitFor': 5000
    }
)
html = response.text
```

Then parse HTML with BeautifulSoup.
