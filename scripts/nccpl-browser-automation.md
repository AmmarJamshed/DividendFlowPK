# NCCPL Data Automation via Browser MCP

## Problem
Cloudflare blocks headless browser automation, preventing automated scraping of NCCPL data.

## Solution
Use a browser automation service that can bypass Cloudflare. Two options:

### Option 1: Browserless.io (Recommended for Render)

1. Sign up for Browserless.io (free tier available)
2. Get API token
3. Use their API to run Puppeteer scripts remotely
4. Their browsers bypass Cloudflare automatically

### Option 2: Local Browser + Scheduled Task

1. Run browser automation locally with headed browser
2. Use Windows Task Scheduler to run daily at 5:30 PM PKT
3. Commit and push updated CSV to GitHub
4. Render pulls latest data on next deployment

### Option 3: Playwright with Browserless

Use Playwright with Browserless endpoint:

```python
from playwright.sync_api import sync_playwright

BROWSERLESS_TOKEN = os.getenv('BROWSERLESS_TOKEN')
BROWSERLESS_URL = f'wss://chrome.browserless.io?token={BROWSERLESS_TOKEN}'

with sync_playwright() as p:
    browser = p.chromium.connect(BROWSERLESS_URL)
    # ... rest of scraping logic
```

## Current Workaround

Until automated solution is implemented:
1. Manually visit https://www.nccpl.com.pk/market-information
2. Click "VAR Margins" tab
3. Click "Export" button
4. Run: `python scripts/process-nccpl-export.py`
5. Commit and deploy

## Files
- `scrape-nccpl.py` - Original Python scraper (blocked by Cloudflare)
- `scrape-nccpl.cjs` - Node.js scraper (blocked by Cloudflare)
- `process-nccpl-export.py` - Process downloaded CSV
- `scrape-nccpl-automated.py` - Process CSV from Downloads folder
