# DividendFlow PK – AI Dividend Intelligence for PSX

A web-based financial analysis platform for the Pakistan Stock Exchange (PSX), providing dividend optimization tools, AI risk analysis, and salary replacement simulation.

## Project Structure

```
D:\DividendFlowPK\
├── frontend/          # React application
├── backend/           # Node.js + Express API
├── data/
│   ├── dividends/     # psx_dividend_calendar.csv
│   ├── financials/    # psx_quarter_cycles.csv
│   ├── news/          # News headlines (txt/csv)
│   └── prices/        # Price history (csv)
├── ai/
├── logs/
├── research/
└── README.md
```

## Prerequisites

- Node.js installed at `D:\NodeJS\` (or in PATH)
- Groq API account: https://console.groq.com

## Local Development

### 1. Configure Groq API Key

1. Create `backend/.env` (copy from `backend/.env.example`)
2. Add your API key: `GROQ_API_KEY=your_actual_key_here`
3. Never expose the API key in the frontend

### 2. Run Backend

```bash
cd D:\DividendFlowPK\backend
npm install
node server.js
```

Backend runs at http://localhost:5000

### 3. Run Frontend

```bash
cd D:\DividendFlowPK\frontend
npm install
npm start
```

Frontend runs at http://localhost:3000

## Data Sources

Dividend and price data are sourced from:
- **PSX Market Summary**: https://www.psx.com.pk/market-summary
- **PSX Payouts**: https://dps.psx.com.pk/payouts
- **Profit Pakistan Today**, **StockAnalysis.com** for dividend announcements

Data is updated periodically. For latest figures, visit PSX directly.

## Updating Dividend Datasets

- **Dividend Calendar**: Edit `data/dividends/psx_dividend_calendar.csv`
  - Columns: Company, Sector, Dividend_per_share, Payment_month, Dividend_yield, Price, Year

- **Quarter Cycles**: Edit `data/financials/psx_quarter_cycles.csv`
  - Columns: Company, Sector, Fiscal_Year_End, Quarter_End_Months, Dividend_Announcement_Period, Book_Closure_Month, Estimated_Payment_Month

## Adding News Files

Place files in `data/news/`:

- **TXT format**: One headline per line. Lines containing the company name are used for AI analysis.
- **CSV format**: Columns `Company`, `Headline` (or `Title`). Rows matching the company are sent to Groq.

## Adding Price Data

Place CSV files in `data/prices/` with columns: Company, Date, Price (or Close)

## Features

| Module | Description |
|--------|-------------|
| Dashboard | Monthly heatmap, top yields, AI risk alerts |
| Dividend Calendar | PSX dividend payment schedule |
| Weak Month Optimizer | Identifies months with low dividend coverage |
| AI Risk Dashboard | Groq-powered adverse media analysis |
| Forecast Engine | Probability-based price ranges, blended returns |
| Salary Simulator | Required portfolio for target income |
| PSX Reporting Cycles | Fiscal year and dividend timing |

## Legal Disclaimer

This platform provides analytical insights based on historical and probabilistic models. It does not constitute investment advice. Users should conduct further research before making financial decisions.

**Never generates**: Buy now, Sell tomorrow, Guaranteed returns

## Future Deployment

### Frontend (Hostinger)

1. Build: `cd frontend && npm run build`
2. Upload `build/` contents to Hostinger via File Manager or FTP
3. Set `REACT_APP_API_URL` to your backend URL before building

### Backend (VPS / Railway / Render / Fly.io)

1. Deploy `backend/` folder
2. Set environment variable `GROQ_API_KEY`
3. Ensure `data/` folder is accessible or mount persistent storage
4. Update CORS if needed for your domain

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| /api/dividends | GET | Dividend calendar data |
| /api/month-coverage | GET | Monthly coverage for optimizer |
| /api/risk-score | POST | AI risk analysis (body: { companyName }) |
| /api/forecast | GET | Price forecast (?company=HBL) |
| /api/salary-simulator | POST | Portfolio calculator |
| /api/reporting-cycles | GET | PSX quarter cycles |
| /api/capital-gain | GET | Blended return estimator |
