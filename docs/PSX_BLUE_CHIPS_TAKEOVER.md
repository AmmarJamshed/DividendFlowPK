# DividendFlow PK → PSX Blue Chips takeover (Oct 2026)

DividendFlow.pk has been **closed as a product**. **PSX Blue Chips** (`https://psxbluechips.com`) is the primary brand going forward.

## Render (done)

All `dividendflow-*` Render services were **suspended and deleted**:

- dividendflow-frontend
- dividendflow-backend
- dividendflow-scraper
- dividendflow-news
- dividendflow-health-check
- dividendflow-nccpl-scraper

`render.yaml` is marked **RETIRED** — do not deploy.

Other non-DividendFlow Render services on the account were left untouched. Cancel any unused Render plan in the dashboard if nothing else needs billing.

## GitHub Actions

Scheduled workflows under `.github/workflows/` are disabled (`schedule` removed, jobs gated with `if: false`). Manual `workflow_dispatch` remains in the YAML for emergency use but jobs will not run until the gate is removed.

## Domain

Keep `dividendflow.pk` as a **301 redirect** to `psxbluechips.com` (Netlify / registrar).
