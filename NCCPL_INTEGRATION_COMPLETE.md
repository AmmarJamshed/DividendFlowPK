# NCCPL Risk Integration - Complete ✓

## Overview
DividendFlow.pk now displays real-time NCCPL risk indicators (VaR, Haircut) for 550+ PSX stocks, with automated daily updates.

## What Was Built

### 1. Data Acquisition ✓
- **Real NCCPL Data**: Extracted actual VAR Margins data from www.nccpl.com.pk/market-information
- **550+ Symbols**: Covers all major PSX stocks including OGDC, HBL, PPL, PSO, LPL, NCPL, etc.
- **Data Points**: VaR Value, Haircut %, 26-Week Avg, Free Float, Half Hour Avg Rate

### 2. Automated Daily Scraping ✓
- **Browserless.io Integration**: Cloud browser service bypasses Cloudflare protection
- **Render Cron Job**: Runs daily at 5:30 PM PKT (after market close)
- **Auto-Commit**: Pushes updated data to GitHub automatically
- **Schedule**: `30 12 * * *` (12:30 PM UTC = 5:30 PM PKT)

### 3. Risk Score Engine ✓
Implemented in `backend/server.js`:

```javascript
// With volatility:
risk_score = (0.4 * var_value) + (0.3 * haircut) + (0.3 * volatility)

// Without volatility:
risk_score = (0.6 * var_value) + (0.4 * haircut)

// Risk Labels:
<= 8: Low Risk
8-15: Moderate Risk
> 15: High Risk
```

### 4. Backend API ✓
Two new endpoints in `backend/server.js`:

**GET /api/stock-risk/:symbol**
```json
{
  "symbol": "OGDC",
  "var": 14.5,
  "haircut": 17.5,
  "free_float": 654895663,
  "risk_score": 15.7,
  "risk_label": "High",
  "insight": "High downside risk with ~14.5% VaR and 17.5% haircut..."
}
```

**GET /api/stock-risk**
```json
[
  { "symbol": "OGDC", "risk_score": 15.7, "risk_label": "High", ... },
  ...
]
```

### 5. UI Integration ✓

#### AI Risk Dashboard (`frontend/src/pages/AIRiskDashboard.js`)
- Displays NCCPL Risk Label with color coding
- Shows VaR as "Downside Risk"
- Shows Haircut percentage
- Includes detailed risk insight below AI analysis

#### Main Dashboard (`frontend/src/pages/Dashboard.js`)
- Risk badges on Top Dividend Yield stocks
- Color-coded labels: 🟢 Low, 🟡 Moderate, 🔴 High
- Shows VaR and Haircut percentages
- Example: "LPL – 13.82% 🔴 High Risk (VaR: 21%, Haircut: 27.5%)"

## Data Flow

```
NCCPL Website (Cloudflare Protected)
    ↓
Browserless.io Cloud Browser (Bypasses Cloudflare)
    ↓
Render Cron Job (scrape-nccpl-browserless.py)
    ↓
data/risk/nccpl_risk_metrics.csv (550+ stocks)
    ↓
Git Push to GitHub
    ↓
Render Auto-Redeploy (Backend + Frontend)
    ↓
API Endpoints (/api/stock-risk)
    ↓
React Frontend (Dashboard + AI Risk)
    ↓
Users see real-time risk indicators
```

## Setup Required

### On Render Dashboard:

1. **Get Browserless.io Token**:
   - Sign up at https://www.browserless.io/
   - Free tier: 1,000 requests/month
   - Copy API token

2. **Add Environment Variables** to `dividendflow-nccpl-scraper` cron job:
   ```
   BROWSERLESS_TOKEN=your_browserless_token_here
   GITHUB_TOKEN=your_github_token_here
   GITHUB_REPO=AmmarJamshed/DividendFlowPK
   ```

3. **Deploy**: Render will automatically create the cron job from `render.yaml`

## Files Created/Modified

### New Files:
- `scripts/scrape-nccpl-browserless.py` - Main automated scraper
- `scripts/scrape-nccpl.cjs` - Node.js scraper (alternative)
- `scripts/scrape-nccpl-automated.py` - Process from Downloads
- `scripts/process-nccpl-export.py` - Manual processing script
- `requirements-scraper.txt` - Python dependencies
- `NCCPL_AUTOMATION_SETUP.md` - Detailed setup guide
- `scripts/nccpl-browser-automation.md` - Technical notes

### Modified Files:
- `render.yaml` - Added NCCPL scraper cron job
- `backend/server.js` - Added risk endpoints and calculation logic
- `frontend/src/pages/AIRiskDashboard.js` - Added NCCPL risk display
- `frontend/src/pages/Dashboard.js` - Added risk badges to top yields
- `data/risk/nccpl_risk_metrics.csv` - Now contains 550+ real stocks

## Current Status

✅ **Real Data**: Using actual NCCPL data (not samples)
✅ **550+ Stocks**: All major PSX stocks covered
✅ **Backend API**: Working and serving risk data
✅ **Frontend UI**: Displaying risk indicators
✅ **Automation Ready**: Cron job configured (needs Browserless token)

## Next Steps

1. **Add Browserless Token** to Render environment variables
2. **Monitor First Run**: Check cron job logs after 5:30 PM PKT
3. **Verify Updates**: Confirm CSV is updated and pushed to GitHub daily

## Monitoring

Check Render dashboard → `dividendflow-nccpl-scraper` → Logs

Look for:
```
[NCCPL] ✓ Success: XXX symbols scraped
[NCCPL] ✓ Pushed to GitHub
```

## Manual Fallback (if needed)

If Browserless.io has issues:
1. Visit https://www.nccpl.com.pk/market-information
2. Click "VAR Margins" tab
3. Click "Export" button
4. Run: `python scripts/process-nccpl-export.py`
5. Commit: `git add data/risk/nccpl_risk_metrics.csv && git commit -m "Update NCCPL data" && git push`

## Cost
- **Browserless.io**: Free (1,000 requests/month)
- **Render Cron**: Free tier
- **Total**: $0/month

---

**Status**: ✅ COMPLETE - Ready for production with Browserless.io token
