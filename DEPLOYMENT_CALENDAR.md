# DividendFlow PK — deployment & automation calendar

**PKT** = Pakistan Standard Time (**UTC+5**, no DST). Unless noted, cron times are **UTC**.

### Export (CSV + Excel)

| File | Contents |
|------|----------|
| **[docs/deployment-calendar.xlsx](docs/deployment-calendar.xlsx)** | Workbook: *All items*, *Summary by type*, *Cron reference* (formatted) |
| **[docs/deployment-calendar.csv](docs/deployment-calendar.csv)** | Main table — UTF-8 with BOM (opens cleanly in Excel) |
| **[docs/deployment-calendar-summary.csv](docs/deployment-calendar-summary.csv)** | Grouped by Schedule or demand |
| **[docs/deployment-calendar-cron.csv](docs/deployment-calendar-cron.csv)** | Cron expressions only |

Regenerate after editing the script:

```bash
pip install openpyxl
python scripts/export-deployment-calendar.py
```

---

## Complete list (Schedule vs demand)

| # | Item | **Schedule or demand** | When / detail (UTC → PKT) | Platform | What it does |
|---|------|-------------------------|---------------------------|----------|----------------|
| 1 | **dividendflow-backend** | **Continuous** | Runs 24/7 after deploy | Render Web | REST API, serves `data/*.csv`, AI, market APIs |
| 2 | **dividendflow-frontend** | **Continuous** | Runs 24/7 after deploy | Render Static | Serves built React app |
| 3 | **Backend build** | **On demand** | Each time backend service deploys | Render | `cd backend && npm install` → `node server.js` |
| 4 | **Frontend build** | **On demand** | Each time frontend service deploys | Render | `npm install && npm run build` → publish `build/` |
| 5 | **dividendflow-scraper** | **Scheduled** | **Daily 11:00 UTC** → **16:00 PKT** | Render Cron | `run-all.js` — dividend merge, CSVs, optional GitHub push + email |
| 6 | **dividendflow-news** | **Scheduled** | **Daily 12:00 UTC** → **17:00 PKT** | Render Cron | `run-news.js` — news, prices, Groq, GitHub push |
| 7 | **dividendflow-nccpl-scraper** | **Scheduled** | **Daily 12:30 UTC** → **17:30 PKT** | Render Cron | NCCPL risk via Browserless → CSV / GitHub |
| 8 | **dividendflow-health-check** | **Scheduled** | **Every 6 hours**: 00:00, 06:00, 12:00, 18:00 UTC → 05:00, 11:00, 17:00, 23:00 PKT | Render Cron | `health-check.js` pings `BACKEND_URL` |
| 9 | **PSX Market Closing Prices** (GitHub Actions) | **Scheduled** | **Daily 12:00 UTC** → **17:00 PKT** | GitHub Actions | `psx.py` — full prices + **all pages payouts** → CSVs → commit/push |
| 10 | **PSX Market Closing Prices** | **On demand** | Any time (manual button) | GitHub Actions | Same as row 9 — *Actions → Run workflow* |
| 11 | **deploy-render.ps1** | **On demand** | Any time you run it | Local + Render API | Triggers deploy for all Blueprint services |
| 12 | **Git push → Render** | **On demand** | When you push to connected branch (e.g. `main`) | GitHub + Render | Auto-build & deploy if enabled in Render |
| 13 | **Render Dashboard → Manual Deploy** | **On demand** | Any time | Render UI | Per-service *Manual Deploy* |

---

## Summary by type

| Type | Count | Items |
|------|-------|--------|
| **Continuous** | 2 | Backend web, Frontend static |
| **Scheduled** | 5 | `dividendflow-scraper`, `dividendflow-news`, `dividendflow-nccpl-scraper`, `dividendflow-health-check`, GitHub `psx` cron |
| **On demand** | 6 | Frontend/backend *builds* (per deploy), GitHub `psx` manual run, `deploy-render.ps1`, git push deploy, Render manual deploy |

---

## Cron expressions (reference)

| Service / workflow | Cron (UTC) | Human readable |
|--------------------|------------|----------------|
| `dividendflow-scraper` | `0 11 * * *` | Daily 11:00 |
| `dividendflow-news` | `0 12 * * *` | Daily 12:00 |
| `dividendflow-nccpl-scraper` | `30 12 * * *` | Daily 12:30 |
| `dividendflow-health-check` | `0 */6 * * *` | Every 6 hours on the hour |
| GitHub `PSX Market Closing Prices` | `0 12 * * *` | Daily 12:00 |

---

## Typical PKT trading-day order (scheduled only)

1. **16:00** — `dividendflow-scraper`  
2. **17:00** — `dividendflow-news` **and** GitHub `psx.py` (same UTC hour)  
3. **17:30** — `dividendflow-nccpl-scraper`  
4. **05:00 / 11:00 / 17:00 / 23:00** — `dividendflow-health-check`

*Render cold starts can add a few minutes.*

---

## Blueprint service names (for `deploy-render.ps1`)

`dividendflow-frontend`, `dividendflow-backend`, `dividendflow-scraper`, `dividendflow-news`, `dividendflow-nccpl-scraper`, `dividendflow-health-check`
