# Supabase setup — DividendFlow.pk

Project **dividendflow-pk** (region: ap-south-1)

| Setting | Value |
|---------|--------|
| Project ID | `dbkytlsejpxmclpznudk` |
| API URL | `https://dbkytlsejpxmclpznudk.supabase.co` |
| Dashboard | https://supabase.com/dashboard/project/dbkytlsejpxmclpznudk |

## 1. Get API keys

1. Open **Project Settings → API**
2. Copy **Project URL** → `SUPABASE_URL`
3. Copy **service_role** (secret) → `SUPABASE_SERVICE_ROLE_KEY` — backend & ETL only
4. Copy **anon** key → `SUPABASE_ANON_KEY` (optional; read-only via RLS)

## 2. Local backend

```powershell
cd backend
copy .env.example .env
# Paste SUPABASE_SERVICE_ROLE_KEY into .env
npm install
npm run etl:supabase
npm start
```

## 3. Render

In **dividendflow-backend** service, set:

- `SUPABASE_URL` = `https://dbkytlsejpxmclpznudk.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` = (service role secret)

## 4. GitHub Actions

Add repository secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Workflow **Supabase CSV Sync** runs weekdays at 12:30 UTC after PSX scrapers.

## 5. Schema

Migration: `supabase/migrations/001_dividendflow_core_schema.sql`

Tables: `exchanges`, `securities`, `daily_prices`, `dividend_calendar`, `dividend_payouts`, `quarter_cycles`, `price_history`, `price_changes`, `news_*`, `financial_metrics`, `ai_insights`, `data_sync_log`.

RLS enabled with **anon SELECT** and **service_role full access**.

## 6. Data flow

```
PSX scrapers → CSV in repo → scripts/etl-csv-to-supabase.js → PostgreSQL
                                    ↓
                         backend/services/dataStore.js
                                    ↓
                    API (Supabase first, CSV fallback)
```

Existing CSV files remain the source of truth for scrapers; Supabase is the permanent historical store.
