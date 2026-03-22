# DividendFlow PK — deployment & automation calendar

All **cron** times below use **UTC** (Render / GitHub). **PKT** = Pakistan Standard Time (**UTC+5**, no DST).

---

## Manual deploy (any time)

| Action | Command / where |
|--------|------------------|
| Trigger all Render services | `.\deploy-render.ps1` (uses `RENDER_API_KEY` or Render CLI) |
| Git push → auto deploy | Push to `main` (if auto-deploy is on in Render) |

**Render services (Blueprint):** `dividendflow-frontend`, `dividendflow-backend`, `dividendflow-scraper`, `dividendflow-news`, `dividendflow-nccpl-scraper`, `dividendflow-health-check`

---

## Always-on (no fixed “run” time)

| Service | Platform | Notes |
|---------|----------|--------|
| **dividendflow-backend** | Render Web | API + reads `data/` from deploy |
| **dividendflow-frontend** | Render Static | Built on each deploy |

---

## Daily schedule (UTC → PKT)

| Time (UTC) | Time (PKT) | Job | Platform | What it does |
|------------|------------|-----|----------|----------------|
| **00:00** | 05:00 | Health check | Render cron `dividendflow-health-check` | Pings backend (`health-check.js`) |
| **06:00** | 11:00 | Health check | Same | Same |
| **11:00** | **16:00 (4 PM)** | Main dividend scraper | Render cron `dividendflow-scraper` | `run-all.js` — psxterminal merge, CSVs, optional GitHub push + email |
| **12:00** | **17:00 (5 PM)** | News + prices pipeline | Render cron `dividendflow-news` | `run-news.js` — news, daily prices, Groq, GitHub push |
| **12:00** | **17:00 (5 PM)** | PSX market + **full payouts** | **GitHub Actions** — `PSX Market Closing Prices` | `psx.py` — `psx_full_dataset.csv`, `daily_prices`, `price_changes`, **`psx_payouts.csv`** (all pages) |
| **12:30** | **17:30 (5:30 PM)** | NCCPL risk scrape | Render cron `dividendflow-nccpl-scraper` | `scrape-nccpl-browserless.py` → risk CSV / GitHub |
| **18:00** | 23:00 | Health check | Render cron `dividendflow-health-check` | Same |

---

## Health check — every 6 hours

| Cron expression | Runs (UTC) |
|-----------------|------------|
| `0 */6 * * *` | **00:00**, **06:00**, **12:00**, **18:00** |

---

## Cron quick reference (from `render.yaml`)

| Service | Cron (UTC) | Human summary |
|---------|------------|----------------|
| `dividendflow-scraper` | `0 11 * * *` | Daily 11:00 UTC |
| `dividendflow-news` | `0 12 * * *` | Daily 12:00 UTC |
| `dividendflow-nccpl-scraper` | `30 12 * * *` | Daily 12:30 UTC |
| `dividendflow-health-check` | `0 */6 * * *` | Every 6 hours on the hour |

---

## GitHub Actions (`.github/workflows/psx-market-prices.yml`)

| Trigger | Schedule |
|---------|----------|
| **Cron** | `0 12 * * *` — daily **12:00 UTC** (17:00 PKT) |
| **Manual** | Actions → *PSX Market Closing Prices* → *Run workflow* |

---

## Typical trading-day flow (PKT)

1. **~16:00** — `dividendflow-scraper` refreshes dividend calendar merge (Node).  
2. **~17:00** — GitHub `psx.py` (full PSX prices + **457-row payouts**) + Render `dividendflow-news` (news + movers).  
3. **~17:30** — NCCPL risk refresh.  
4. **Health checks** — 05:00, 11:00, 17:00, 23:00 PKT.

*Render free/spin-down tiers can delay cold starts by a few minutes.*
