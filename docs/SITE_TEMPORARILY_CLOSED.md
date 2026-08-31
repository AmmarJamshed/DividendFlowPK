# Site status (updated Aug 2026)

The temporary ComingSoon waitlist shutdown has been **lifted** in the frontend.

- Full app routes are restored in `frontend/src/App.js`.
- Home is redesigned around theme opening art + YouTube embed (`1PqDWTfUNHQ`).
- GitHub Pages deploy workflow (`frontend-pages.yml`) is re-enabled.
- Scraper / ingest / health workflows may still be gated with `if: false  # SITE_CLOSED` until Render cron services are resumed.

When bringing backends back online on Render, also remove remaining `SITE_CLOSED` gates in `.github/workflows/` and re-enable disabled Actions via `gh workflow enable`.
