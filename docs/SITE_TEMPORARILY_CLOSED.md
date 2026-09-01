# Site status (updated Sep 2026)

The temporary ComingSoon shutdown has been **fully lifted**.

## Restored

- Full frontend app routes (`frontend/src/App.js`)
- GitHub Pages deploy (`frontend-pages.yml`)
- PSX data pipelines (GitHub Actions):
  - DividendFlow Scraper
  - DividendFlow News
  - DividendFlow Health Check
  - PSX Market Closing Prices
  - PSX Workflow Monitor
  - Supabase CSV Sync
  - Verify all Render cron replacements
  - Backend Vercel Deploy (on `backend/**` pushes)

## Still off by design (PSX-only product focus)

These workflows remain gated with `if: false` until global markets return:

- Global market ingest (NYSE, NASDAQ, LSE, HKEX)
- Global dividend sync
- IPO calendar sync (PSX IPOs are curated in `data/ipos/psx_ipos.json`)

## Render

Resume cron/web services in the Render dashboard when billing is active. GitHub Actions can run the same jobs as a backup while Render crons spin up.
