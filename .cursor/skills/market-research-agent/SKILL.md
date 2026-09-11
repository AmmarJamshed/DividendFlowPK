---
name: market-research-agent
description: >-
  Run DividendFlow.pk Market Research Crawler Agent for any industry/topic
  report with year+URL citations and PSX stock join. Use when the user asks for
  sector research, market sizing, demand/supply planning briefs, competitive
  landscape notes, or research-analyst style reports tied to listed stocks.
---

# Market Research Agent (DividendFlow.pk)

## When to use

- Any industry / product / demand topic research (not only fast food)
- User roles: research analyst, market researcher, demand & supply planner
- Need sourced stats + related PSX tickers in one pack

## Hard rules

- Every fact needs **year + direct URL** (no invented links)
- Use wording **Simple Word answer** — never the word "baby"
- Educational only — not investment advice
- Prefer allowlisted official sources (BOI, Trade.gov, PIDE, Statista public pages, Dawn business)

## Run the agent

From repo `scripts/`:

```bash
node market-research-agent.js --topic "<TOPIC>" --audience market_researcher --symbols "TICK1,TICK2" --geo Pakistan --offline
```

Audiences: `analyst` | `market_researcher` | `demand_planner`

Omit `--offline` only when `GROQ_API_KEY` is set for LLM synthesis.

## Outputs

- `docs/research/<slug>-report.html`
- `data/research/<slug>.json`

## API / product UI

- Lab page: `/research-lab`
- `POST /api/v1/research/jobs`
- `GET /api/v1/research/reports`
- `GET /api/v1/research/reports/:slug/html`

## After generating

1. Open the HTML report and verify citation chips
2. Confirm stock cards show real prices from `data/prices/price_changes.csv`
3. Summarize for the user with links to the HTML/JSON paths
