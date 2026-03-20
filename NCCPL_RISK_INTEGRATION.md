# NCCPL Risk Integration - Manual Update Instructions

## Overview
DividendFlow now integrates NCCPL (National Clearing Company of Pakistan) risk indicators including:
- **VaR (Value at Risk)**: Downside risk percentage  
- **Haircut**: Margin requirement percentage
- **Risk Score & Label**: Calculated risk assessment (Low/Moderate/High)

## Data Source
**URL**: https://www.nccpl.com.pk/market-information > VAR Margins tab

## Issue: Cloudflare Protection
The NCCPL website uses Cloudflare protection that blocks automated scraping. Headless browsers and standard HTTP requests are rejected.

## Solution: Manual Periodic Updates

### Steps to Update Risk Data:

1. **Visit NCCPL website** in your browser
   - Go to: https://www.nccpl.com.pk/market-information
   - Click on **"VAR Margins"** tab
   - Click **"Export"** button to download CSV

2. **Process the downloaded file**
   - The export will contain columns: Date, Symbol, VaR Value, Hair Cut, 26Week Avg, Acc Qtyts, etc.
   - Clean symbols by removing suffixes (e.g., BAHL-CAPRN1 → BAHL)
   - For companies with multiple entries, keep the maximum VaR and Haircut

3. **Update the data file**
   - Replace `data/risk/nccpl_risk_metrics.csv` with cleaned data
   - Format:
     ```csv
     symbol,symbol_full,var_value,haircut,week_26_avg,free_float,half_hour_avg_rate,trade_halt,last_updated
     OGDC,OGDC,10.0,15.0,0.0,800817437,153.51,N,2026-03-19 17:30:00
     ```

4. **Commit and push changes**
   ```bash
   git add data/risk/nccpl_risk_metrics.csv
   git commit -m "Update NCCPL risk metrics"
   git push origin main
   ```

5. **Deploy to Render**
   - Render will automatically redeploy when changes are pushed
   - Backend will serve updated risk data via `/api/stock-risk/:symbol`

## Update Frequency
- **Recommended**: Weekly (NCCPL updates risk parameters periodically)
- **Minimum**: Monthly (to keep risk indicators reasonably current)

## Integration Points

### Backend API
- `GET /api/stock-risk/:symbol` - Individual stock risk
- `GET /api/stock-risk` - All stocks summary

### Frontend Display
1. **AI Risk Dashboard** (`/ai-risk-dashboard`)
   - Shows NCCPL risk indicators alongside AI risk analysis
   - Displays VaR, Haircut, and Risk Label in dedicated cards

2. **Main Dashboard** (`/`)
   - Top Dividend Yield section now shows risk badges
   - Color-coded: 🛡️ Low (green), ⚖️ Moderate (amber), 🚨 High (red)

## Risk Score Calculation
```javascript
if (volatility available):
  risk_score = (0.4 × VaR) + (0.3 × Haircut) + (0.3 × Volatility)
else:
  risk_score = (0.6 × VaR) + (0.4 × Haircut)

Risk Labels:
  ≤ 8: Low
  8-15: Moderate
  > 15: High
```

## Future Enhancement
If NCCPL provides an API or removes Cloudflare protection, the scraper (`scripts/scrape-nccpl.py`) can be activated for automated daily updates.
