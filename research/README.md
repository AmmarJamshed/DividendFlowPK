# DividendFlow.pk Market Research Agent

Reusable crawler + synthesizer that turns any industry topic into a sourced research pack (HTML + JSON), joined to PSX stock data.

## Who it is for

| Audience | Focus |
|----------|--------|
| `analyst` | Sector brief + listed peers / prices / yields |
| `market_researcher` | Sizing, barriers, incentives, trends, citations |
| `demand_planner` | Demand gaps, supply signals, planner scores |

## Run (CLI)

From repo root (or `scripts/` with Node):

```bash
cd scripts
node market-research-agent.js --topic "Pakistan fast food market" --audience market_researcher --symbols "NESTLE,UNITY" --geo Pakistan
```

Optional:

```bash
node market-research-agent.js --topic "Pakistan cement demand" --audience demand_planner --symbols "LUCK,MLCF,DGKC" --offline
```

`--offline` skips Groq and builds a deterministic report from crawl + stock evidence (good for CI / no API key).

## Outputs

- `docs/research/<slug>-report.html` — DividendFlow-branded HTML
- `data/research/<slug>.json` — machine-readable report
- `data/research/jobs/<id>.json` — job status (when started via API)

## Email delivery

Pass `email` in `POST /api/v1/research/jobs` (or use Research Lab form). When the job completes, the backend emails a branded link to the HTML report via Resend/SMTP.

Also: `POST /api/v1/research/reports/:slug/email` `{ "email": "you@company.com" }` to re-send an existing report.


## Citation rules

Every fact: **year + direct URL**. No invented links. Prefer BOI, Trade.gov, PIDE, Statista public pages, company filings, Dawn/business RSS.

## Stock join

Reads `data/prices/price_changes.csv` and dividend calendar CSVs (same store as the app). Pass `--symbols` or let heuristics suggest peers from the topic.
