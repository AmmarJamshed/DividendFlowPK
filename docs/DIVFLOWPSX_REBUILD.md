# Rebuild guide: `divflowpsx` (archived)

**Status:** Withdrawn from public use (July 2026). Source snapshot: `docs/archives/divflowpsx-source/`.

DividendFlow PK published a delayed PSX market-data Python package on PyPI (`divflowpsx`). It was removed while the product is offline for a larger relaunch. Use this doc when you want to revive or rewrite it.

---

## What it did

| API | Behavior |
|-----|----------|
| `get_board()` | Full PSX DPS historical board → pandas DataFrame |
| `get_quote(symbol)` | One ticker from the board |
| `get_changes()` | Session movers from board |
| `get_payouts()` | PSX payout announcements |
| Delay | Minimum **10 seconds** before data is returned |
| Browser | Playwright Chromium (auto-install on first scrape) |
| Colab | Sync Playwright run in a worker thread (`run_sync`) |

Sources scraped:

- `https://dps.psx.com.pk/historical`
- `https://dps.psx.com.pk/payouts`

Related production scraper (site ETL, not the library): repo root `psx.py`.

---

## Archived layout

```
docs/archives/divflowpsx-source/
  pyproject.toml
  README.md
  LICENSE
  src/divflowpsx/
    __init__.py
    api.py
    client.py
    delay.py
    progress.py
    scraper.py
    _browser.py
    _ensure_browser.py
```

Last working public version: **0.1.4** (before withdrawal stub).

---

## Rebuild checklist

1. **Copy archive → new package folder** (e.g. `divflowpsx/` or a new repo).
2. **Bump version** in `pyproject.toml` (do not reuse yanked versions if PyPI yanked them).
3. **Restore real modules** from `src/divflowpsx/` (replace any withdrawal stub).
4. **Test locally**
   ```bash
   pip install -e ./divflowpsx
   python -c "import divflowpsx; print(divflowpsx.get_board().head())"
   ```
5. **Test Colab** — install, restart runtime, `get_board()` with progress bars.
6. **Publish**
   ```bash
   python -m build
   twine upload dist/*
   ```
7. **Secrets:** use a **new** PyPI token scoped to the project; never commit tokens.

---

## Known pitfalls (fix before republishing)

| Issue | Fix |
|-------|-----|
| Colab `Sync API inside asyncio loop` | `run_sync()` → thread pool (`_browser.py`) |
| Colab `TargetClosedError` / headless_shell | `PLAYWRIGHT_CHROMIUM_USE_HEADLESS_SHELL=0` + `playwright install --with-deps chromium` |
| `NameError: time` | Keep `import time` in `delay.py` |
| Colab stuck on old version | `pip install -U --force-reinstall --no-cache-dir` + **Restart session** |
| pandas 3 vs Colab | Prefer `pandas>=2.0,<3` for Colab friendliness |

---

## Minimal public API (keep stable)

```python
import divflowpsx
board = divflowpsx.get_board()
q = divflowpsx.get_quote("HBL")
movers = divflowpsx.get_changes()
payouts = divflowpsx.get_payouts()

from divflowpsx import Client
Client(delay_seconds=10).get_board()
```

---

## Legal / product notes

- Delayed data only — not for live trading.
- Disclaimer: research / education, not buy/sell advice.
- Respect PSX portal ToS and rate limits when scraping.

When DividendFlow returns, update this file with the new package name/version if it changes.
