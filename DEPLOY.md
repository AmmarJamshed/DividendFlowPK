# Deploy DividendFlow PK to Render

## Step 1: Push to GitHub

1. Create a new repository on [GitHub](https://github.com/new):
   - Name: `DividendFlowPK` (or your choice)
   - Visibility: Public or Private
   - **Do not** initialize with README, .gitignore, or license (you already have them)

2. Push your code. In PowerShell, run from `d:\DividendFlowPK`:

```powershell
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

Replace `YOUR_USERNAME` and `YOUR_REPO_NAME` with your GitHub username and repo name.

## Step 2: Connect to Render

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **New** → **Blueprint**
3. Connect your GitHub account if needed
4. Select the `DividendFlowPK` repository
5. Render will detect `render.yaml` automatically
6. Click **Apply**

## Step 3: Set Environment Variables

When prompted during Blueprint setup:

| Service | Variable | Value |
|---------|----------|-------|
| **dividendflow-backend** | `GROQ_API_KEY` | Your Groq API key from [console.groq.com](https://console.groq.com) |
| **dividendflow-frontend** | `REACT_APP_API_URL` | `https://dividendflow-backend.onrender.com/api` |

**Important:** Deploy the backend first. Once it's live, copy its URL (e.g. `https://dividendflow-backend.onrender.com`), add `/api` to it, and set that as `REACT_APP_API_URL` for the frontend. Then trigger a manual redeploy of the frontend.

## Step 4: Deploy

Click **Create Web Services**. Both services will deploy. Your app will be live at:

- **Frontend:** `https://dividendflow-frontend.onrender.com`
- **Backend:** `https://dividendflow-backend.onrender.com`

## Cron Jobs (Auto-Scraper & Health Check)

Two cron jobs run automatically:

| Job | Schedule | Purpose |
|-----|----------|---------|
| **dividendflow-scraper** | Daily 06:00 UTC | Scrapes PSX payout data, updates dividend CSVs, pushes to GitHub |
| **dividendflow-health-check** | Every 6 hours | Pings backend to verify it's running |

### Scraper Setup

1. Create a GitHub token: https://github.com/settings/tokens (scope: `repo`)
2. In Render Dashboard → **dividendflow-scraper** → **Environment**
3. Add `GITHUB_TOKEN` = your token
4. Optionally set `GITHUB_REPO` if different from `AmmarJamshed/DividendFlowPK`

### Health Check

If your backend URL differs (e.g. `dividendflow-backend-xxxx.onrender.com`), set `BACKEND_URL` in **dividendflow-health-check** environment.

## Troubleshooting

- **Frontend shows API errors:** Ensure `REACT_APP_API_URL` points to your backend URL + `/api`, then redeploy the frontend.
- **Backend 500 errors:** Check that `GROQ_API_KEY` is set correctly in the backend service.
- **CORS errors:** The backend uses permissive CORS by default; if issues persist, you may need to restrict origins in `backend/server.js`.
- **Scraper not pushing:** Verify `GITHUB_TOKEN` has `repo` scope and is set in the cron service.
