# Setup Browserless.io for NCCPL Automation

## Quick Start (5 minutes)

### 1. Get Browserless.io Token (FREE)

1. Go to **https://www.browserless.io/**
2. Click "Sign Up" (top right)
3. Choose **Free Plan** (1,000 requests/month - enough for daily scraping)
4. Verify email and log in
5. Copy your **API Token** from the dashboard

### 2. Add Token to Render

1. Go to **Render Dashboard**: https://dashboard.render.com/
2. Find the cron job: **`dividendflow-nccpl-scraper`**
3. Click on it → Go to **"Environment"** tab
4. Click **"Add Environment Variable"**
5. Add:
   - **Key**: `BROWSERLESS_TOKEN`
   - **Value**: Paste your Browserless.io token
   - Click **"Save Changes"**

### 3. Verify It's Working

The cron job runs daily at **5:30 PM PKT** (12:30 PM UTC).

To test immediately:
1. In Render dashboard → `dividendflow-nccpl-scraper`
2. Click **"Manual Deploy"** or **"Trigger Job"**
3. Go to **"Logs"** tab
4. Look for:
   ```
   [NCCPL] ✓ Success: 550 symbols scraped
   [NCCPL] ✓ Pushed to GitHub
   ```

### 4. Check Your Website

After the job runs:
1. Go to **https://dividendflow.pk**
2. Check **"Top Dividend Yield"** section
3. You should see risk badges like:
   - **LPL – 13.82% 🔴 High Risk**
   - **OGDC – 8.5% 🟡 Moderate Risk**

4. Click **"AI Risk Analysis"** and search for any stock
5. You should see:
   - Risk Label (Low/Moderate/High)
   - Downside Risk (VaR %)
   - Haircut %
   - Detailed NCCPL insight

## What Happens Daily

Every day at 5:30 PM PKT:

1. ⏰ Render cron job triggers
2. 🌐 Connects to Browserless.io cloud browser
3. 🔓 Bypasses Cloudflare (Browserless handles this)
4. 📊 Navigates to NCCPL → VAR Margins tab
5. 📥 Extracts table data (1,100+ rows)
6. 🧹 Cleans and aggregates to 550+ unique symbols
7. 💾 Saves to `data/risk/nccpl_risk_metrics.csv`
8. 📤 Commits and pushes to GitHub
9. 🚀 Triggers Render redeploy (backend + frontend)
10. ✅ Website shows fresh risk data

## Cost Breakdown

| Service | Plan | Cost | Usage |
|---------|------|------|-------|
| Browserless.io | Free | $0 | 1,000 req/month (30 used) |
| Render Cron | Free | $0 | Included in free tier |
| **Total** | | **$0/month** | |

## Troubleshooting

### Cron Job Fails

**Check Logs**:
1. Render → `dividendflow-nccpl-scraper` → Logs
2. Look for error messages

**Common Issues**:
- `BROWSERLESS_TOKEN not set` → Add token to Render env vars
- `Connection timeout` → Browserless.io might be down (check status.browserless.io)
- `No data scraped` → NCCPL website structure changed (notify developer)

### Data Not Updating on Website

**Check**:
1. Verify cron job ran successfully (check logs)
2. Check GitHub repo for latest commit (should have "Update NCCPL risk data")
3. Check Render backend deployment (should auto-redeploy after GitHub push)
4. Clear browser cache and refresh website

### Browserless.io Quota Exceeded

Free tier = 1,000 requests/month (33 requests/day)
Daily scraping = 30 requests/month

If exceeded:
- Upgrade to paid plan ($50/month for 10,000 requests)
- OR use manual fallback (see below)

## Manual Fallback (No Browserless Needed)

If you want to update data manually:

1. Visit https://www.nccpl.com.pk/market-information
2. Click **"VAR Margins"** tab
3. Click **"Export"** button (downloads CSV)
4. Run locally:
   ```bash
   python scripts/process-nccpl-export.py
   ```
5. Commit and push:
   ```bash
   git add data/risk/nccpl_risk_metrics.csv
   git commit -m "Update NCCPL data"
   git push origin main
   ```

## Alternative Solutions (If Browserless Doesn't Work)

### Option 1: ScrapingBee
- Similar to Browserless
- Free tier: 1,000 requests/month
- Website: https://www.scrapingbee.com/

### Option 2: Bright Data (formerly Luminati)
- More expensive but very reliable
- Free trial available
- Website: https://brightdata.com/

### Option 3: Local Automation
- Run scraper locally with Windows Task Scheduler
- Use headed browser (bypasses Cloudflare)
- Auto-commit and push to GitHub

## Support

If you encounter issues:
1. Check `NCCPL_AUTOMATION_SETUP.md` for detailed technical docs
2. Check Render logs for error messages
3. Verify Browserless.io account is active
4. Test manually to ensure NCCPL website is accessible

---

**Status**: Ready to deploy! Just add the Browserless.io token to Render.
