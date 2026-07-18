# Site temporarily closed (July 2026)

DividendFlow PK is offline while rebuilding into something larger.

## What was done

1. **Frontend** — all routes show `ComingSoon` waitlist page (`frontend/src/pages/ComingSoon.js`).
2. **Analytics / ads** — removed from `frontend/public/index.html` (`noindex`).
3. **Waitlist API** — `POST /api/waitlist` `{ "email": "..." }` → `data/waitlist-emails.json` (+ optional Resend notify).
4. **GitHub Actions** — all project workflows disabled via `gh workflow disable`.
5. **divflowpsx** — implementation archived; rebuild guide at `docs/DIVFLOWPSX_REBUILD.md`; source at `docs/archives/divflowpsx-source/`. PyPI stub `0.2.0` raises on import when published.

## Restore later

1. Revert / restore `frontend/src/App.js` from git history (full Layout + routes).
2. Re-enable workflows: `gh workflow enable "<name>"`.
3. Republish library from archive using `docs/DIVFLOWPSX_REBUILD.md`.
4. Re-add analytics only if desired.
