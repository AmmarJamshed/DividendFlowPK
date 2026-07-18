# divflowpsx

Delayed **Pakistan Stock Exchange (PSX)** market data for Python, from [DividendFlow](https://dividendflow.pk).

> **Not for live trading.** Quotes are intentionally delayed by **at least 10 seconds**. For research and education only — not buy/sell advice.

Progress bars show: **Preparing browser → Opening PSX → Scraping symbols → Delay (≥10s)**.

---

## Google Colab

Use `!` for shell installs. **Restart the session** after installing, or Colab may keep an old version in memory.

```python
# Cell 1 — install
!pip install -U --force-reinstall --no-cache-dir divflowpsx

# Then: Runtime → Restart session
```

```python
# Cell 2 — use (after restart)
import divflowpsx

print(divflowpsx.__version__)  # e.g. 0.1.4+

board = divflowpsx.get_board()  # progress bars + auto Chromium
print(board.head())

q = divflowpsx.get_quote("HBL")  # PSX tickers: HBL, OGDC, ENGRO, …
print(q)

movers = divflowpsx.get_changes()
payouts = divflowpsx.get_payouts()
```

---

## Jupyter / VS Code / local Python

No `!` prefix — use a normal terminal or notebook magics as you prefer.

**Terminal**
```bash
pip install -U divflowpsx
```

**Notebook cell**
```python
%pip install -U divflowpsx
```

**Then**
```python
import divflowpsx

print(divflowpsx.__version__)

board = divflowpsx.get_board()
print(board.head())

q = divflowpsx.get_quote("HBL")
print(q)

movers = divflowpsx.get_changes()
payouts = divflowpsx.get_payouts()
```

---

## Quick API

| Function | Returns |
|----------|---------|
| `get_board()` | Full PSX board (`DataFrame`) |
| `get_quote("HBL")` | One symbol (`dict` or `None`) |
| `get_changes()` | Session movers (`DataFrame`) |
| `get_payouts()` | Dividend / payout rows (`DataFrame`) |

```python
from divflowpsx import Client

client = Client(delay_seconds=10)
df = client.get_board()
```

## Notes

- Scrapes the public PSX DPS portal (`dps.psx.com.pk`).
- `pandas`, `playwright`, and `tqdm` install with the package; **Chromium auto-downloads on first scrape**.
- First call can take a few minutes (browser + board scrape).
- Colab tip: if version looks stuck, use `--force-reinstall --no-cache-dir` then **Restart session**.

## License

MIT © DividendFlow PK
