# DividendFlow PK - Scraper Scripts

Automated cron jobs for PSX data updates.

## Scripts

| Script | Purpose |
|--------|---------|
| `run-all.js` | Main scraper: fetches PSX dividend data, merges with fallback, pushes to GitHub |
| `scrape-psx.js` | Scrapes psxterminal.com/yields for dividend yields |
| `update-github.js` | Updates CSV files in repo via GitHub API |
| `health-check.js` | Pings backend /api/health |

## Cron Schedule

- **dividendflow-scraper** (Render): Daily at **4pm PKT** (11:00 UTC) – dividend data from psxterminal.com
- **dividendflow-news** (Render): Daily at **5pm PKT** (12:00 UTC) – news + prices via `run-news.js` (Node)
- **PSX Market Closing Prices** (GitHub Actions): Daily at **5pm PKT** (12:00 UTC) – full PSX dataset via `psx.py` from dps.psx.com.pk → `psx_full_dataset.csv` for Market Closing Prices tab
- **dividendflow-health-check** (Render): Every 6 hours

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | For scraper | GitHub Personal Access Token with `repo` scope |
| `GITHUB_REPO` | Optional | Default: `AmmarJamshed/DividendFlowPK` |
| `SCRAPER_EMAIL_TO` | For email | Your email to receive daily scraper reports |
| `RESEND_API_KEY` | For email | Resend.com API key (or use SMTP below) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Alternative | Use instead of Resend for email |
| `BACKEND_URL` | For health check | Default: `https://dividendflow-backend.onrender.com` |

## Setup

1. Create a GitHub token: https://github.com/settings/tokens (scope: `repo`)
2. In Render Dashboard → dividendflow-scraper → Environment:
   - Add `GITHUB_TOKEN`
   - Add `SCRAPER_EMAIL_TO` (your email)
   - Add `RESEND_API_KEY` from [resend.com](https://resend.com) **or** SMTP vars (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`)
3. Update `BACKEND_URL` in dividendflow-health-check if your backend URL differs

### Email options

- **Resend**: Sign up at resend.com, create API key, add domain. Free: 100 emails/day.
- **Gmail SMTP**: Enable 2FA, create App Password. Set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASS`.

## Today vs Yesterday (Gainers / Decliners)

- **run-news.js** (5pm PKT) scrapes prices and compares today vs yesterday from `daily_prices.csv`
- **Backend** computes gainers/decliners on-the-fly from the two most recent dates in `daily_prices.csv`
- **Important:** When seeding or updating price data, include both gainers and decliners—the market has both. Avoid data where all stocks are gainers or all flat.

## Local Test

```bash
cd scripts
npm install
GITHUB_TOKEN=your_token node run-all.js   # With push
node run-all.js                            # Without push (writes to ../data/)
node health-check.js
```
