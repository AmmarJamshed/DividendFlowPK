# DividendFlow PK - Scraper Scripts

Automated cron jobs for PSX data updates.

## Scripts

| Script | Purpose |
|--------|---------|
| `run-all.js` | Main scraper: fetches PSX dividend data, merges with fallback, pushes to GitHub |
| `scrape-psx.js` | Scrapes psxterminal.com/yields for dividend yields |
| `update-github.js` | Updates CSV files in repo via GitHub API |
| `health-check.js` | Pings backend /api/health |

## Cron Schedule (Render)

- **dividendflow-scraper**: Daily at 06:00 UTC
- **dividendflow-health-check**: Every 6 hours

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | For scraper | GitHub Personal Access Token with `repo` scope |
| `GITHUB_REPO` | Optional | Default: `AmmarJamshed/DividendFlowPK` |
| `BACKEND_URL` | For health check | Default: `https://dividendflow-backend.onrender.com` |

## Setup

1. Create a GitHub token: https://github.com/settings/tokens (scope: `repo`)
2. In Render Dashboard → dividendflow-scraper → Environment: Add `GITHUB_TOKEN`
3. Update `BACKEND_URL` in dividendflow-health-check if your backend URL differs

## Local Test

```bash
cd scripts
npm install
GITHUB_TOKEN=your_token node run-all.js   # With push
node run-all.js                            # Without push (writes to ../data/)
node health-check.js
```
