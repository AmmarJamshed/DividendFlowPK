#!/usr/bin/env python3
"""
Daily PSX price scraper.

Primary: official market summary ZIP from dps.psx.com.pk/download/mkt_summary/YYYY-MM-DD.Z
Fallback: Playwright scrape of dps.psx.com.pk/historical (#historicalTable)

Payouts: dps.psx.com.pk/payouts → data/dividends/psx_payouts.csv

Outputs: data/prices/psx_full_dataset.csv, daily_prices.csv, price_changes.csv
"""
from playwright.sync_api import sync_playwright
import pandas as pd
import os
import time
import csv
import io
import json
import base64
import urllib.error
import urllib.request
import re
import calendar
import zipfile
from datetime import datetime, timedelta
try:
    from zoneinfo import ZoneInfo
except ImportError:
    ZoneInfo = None  # type: ignore

URL = "https://dps.psx.com.pk/historical"
PAYOUTS_URL = "https://dps.psx.com.pk/payouts"
DOWNLOADS_URL = "https://dps.psx.com.pk/downloads"
MKT_SUMMARY_URL = "https://dps.psx.com.pk/download/mkt_summary/{date}.Z"
DATA_DIR = os.path.join(os.path.dirname(__file__), "data", "prices")
DIVIDEND_DIR = os.path.join(os.path.dirname(__file__), "data", "dividends")
DIVIDEND_CSV = os.path.join(DIVIDEND_DIR, "psx_dividend_calendar.csv")
PAYOUTS_CSV = os.path.join(DIVIDEND_DIR, "psx_payouts.csv")
HTTP_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
_FUTURE_SUFFIX = re.compile(
    r"-(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$",
    re.IGNORECASE,
)


def _karachi_today():
    """Trading date stamp in Asia/Karachi (not UTC runner calendar)."""
    if ZoneInfo is not None:
        return datetime.now(ZoneInfo("Asia/Karachi")).strftime("%Y-%m-%d")
    return datetime.today().strftime("%Y-%m-%d")


def _goto_with_retries(page, url, attempts=4, timeout=90000):
    """PSX sometimes returns ERR_EMPTY_RESPONSE — retry with backoff."""
    last_err = None
    for i in range(attempts):
        try:
            page.goto(url, timeout=timeout, wait_until="domcontentloaded")
            return
        except Exception as e:
            last_err = e
            wait_s = 5 * (i + 1)
            print(f"[WARN] goto {url} failed ({i + 1}/{attempts}): {e}; retry in {wait_s}s")
            time.sleep(wait_s)
    raise last_err


def _launch_chromium(p):
    """Headless Chromium on GitHub Actions needs sandbox disabled (Linux CI)."""
    extra = []
    if os.environ.get("CI") == "true" or os.environ.get("GITHUB_ACTIONS") == "true":
        extra = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-setuid-sandbox"]
    return p.chromium.launch(headless=True, args=extra)


def _parse_book_closure_payment(book_closure_raw):
    """Use last DD/MM/YYYY in book closure as register end; payment month ≈ following month."""
    text = (book_closure_raw or "").replace("\n", " ").strip()
    if not text or text in ("-", "—", "N/A", "TBA"):
        return None
    matches = re.findall(r"(\d{1,2})/(\d{1,2})/(\d{4})", text)
    if not matches:
        matches = re.findall(r"(\d{1,2})-(\d{1,2})-(\d{4})", text)
    if not matches:
        return None
    d, m, y = int(matches[-1][0]), int(matches[-1][1]), int(matches[-1][2])
    if m == 12:
        pay_m, pay_y = 1, y + 1
    else:
        pay_m, pay_y = m + 1, y
    book_end_iso = f"{y}-{m:02d}-{d:02d}"
    return book_end_iso, pay_m, pay_y


_MONTH_WORDS = (
    ("january", 1), ("february", 2), ("march", 3), ("april", 4), ("may", 5), ("june", 6),
    ("july", 7), ("august", 8), ("september", 9), ("october", 10), ("november", 11), ("december", 12),
)


def _month_num_from_word(word):
    w = (word or "").strip().lower()
    if not w:
        return None
    for name, num in _MONTH_WORDS:
        if w.startswith(name[:3]) or name.startswith(w[: min(3, len(w))]):
            return num
    return None


def _parse_announcement_date_payment(announcement_raw):
    """When book closure is '-' on PSX, infer payment month as month after announcement date."""
    m = re.search(r"\b([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})", announcement_raw or "")
    if not m:
        return None
    ann_m = _month_num_from_word(m.group(1))
    if not ann_m:
        return None
    day = int(m.group(2))
    y = int(m.group(3))
    last_d = calendar.monthrange(y, ann_m)[1]
    day = min(day, last_d)
    if ann_m == 12:
        pay_m, pay_y = 1, y + 1
    else:
        pay_m, pay_y = ann_m + 1, y
    book_end_iso = f"{y}-{ann_m:02d}-{day:02d}"
    return book_end_iso, pay_m, pay_y


def _parse_payment_dates(book_closure_raw, announcement_raw):
    """Book closure first; fallback to announcement when closure is missing (PSX shows '-')."""
    p = _parse_book_closure_payment(book_closure_raw)
    if p:
        return p
    return _parse_announcement_date_payment(announcement_raw)


def scrape_psx_payouts():
    """Scrape all rows from dps.psx.com.pk/payouts.

    The PSX portal uses a custom table (#announcementsTable) with Prev/Next buttons
    (not jQuery DataTables). data-total is ~457; ~25 rows per page.

    Columns: Symbol, Company, Sector, Dividend announcement, Announcement date/time, Book closure.
    Book closure: DD/MM/YYYY - DD/MM/YYYY; payment month = month after book-closure END date.
    """
    payouts = []
    seen = set()
    with sync_playwright() as p:
        browser = _launch_chromium(p)
        page = browser.new_page()
        _goto_with_retries(page, PAYOUTS_URL, attempts=4, timeout=90000)
        # networkidle often never settles on SPAs / analytics; don't hang the whole workflow
        try:
            page.wait_for_load_state("networkidle", timeout=20000)
        except Exception:
            pass
        time.sleep(2)

        page.wait_for_selector("#announcementsTable tbody tr", timeout=30000)
        page.wait_for_selector("button.form__button.next", state="visible", timeout=60000)

        for _ in range(60):
            rows = page.query_selector_all("#announcementsTable tbody tr")
            # Desktop + mobile duplicate the same buttons; use the last visible instance
            next_handles = page.query_selector_all("button.form__button.next")
            if not next_handles:
                break
            next_el = next_handles[-1]
            data_offset = int(next_el.get_attribute("data-offset") or 0)
            data_total = int(next_el.get_attribute("data-total") or 0)

            for row in rows:
                cols = row.query_selector_all("td")
                if len(cols) < 6:
                    continue
                symbol = cols[0].inner_text().strip()
                if not symbol or len(symbol) > 20 or "\n" in symbol:
                    continue
                if symbol.lower() in ("symbol", "company", "sr", "#", "no.", "no"):
                    continue

                company = cols[1].inner_text().strip()
                sector = cols[2].inner_text().strip()
                div_ann = cols[3].inner_text().strip()
                ann_date = cols[4].inner_text().strip()
                book_closure = cols[5].inner_text().strip()

                parsed = _parse_payment_dates(book_closure, ann_date)
                if not parsed:
                    continue
                book_end_iso, pay_m, pay_y = parsed

                dedupe_key = (symbol, book_closure.strip(), div_ann.strip())
                if dedupe_key in seen:
                    continue
                seen.add(dedupe_key)

                payouts.append({
                    "Company": symbol,
                    "CompanyName": company,
                    "Sector": sector,
                    "Dividend_announcement": div_ann,
                    "Announcement_date": ann_date,
                    "Book_closure": book_closure.replace("\n", " ").strip(),
                    "BookClosureEnd": book_end_iso,
                    "Payment_month": pay_m,
                    "Year": pay_y,
                })

            n_on_page = len(rows)
            if data_total and data_offset + n_on_page >= data_total:
                break
            if next_el.get_attribute("disabled") is not None:
                break
            try:
                next_el.click(timeout=10000)
            except Exception:
                break
            time.sleep(1.5)
            try:
                page.wait_for_load_state("networkidle", timeout=25000)
            except Exception:
                time.sleep(1)

        browser.close()

    os.makedirs(DIVIDEND_DIR, exist_ok=True)
    # Avoid wiping a good file if the page layout changed or scrape failed mid-run
    min_ok = 100
    if len(payouts) >= min_ok:
        df = pd.DataFrame(payouts)
        df.to_csv(PAYOUTS_CSV, index=False)
        print(f"Saved {len(payouts)} payouts (all pages) to {PAYOUTS_CSV}")
    elif payouts:
        print(f"[WARN] Only {len(payouts)} payout rows (< {min_ok}); not overwriting {PAYOUTS_CSV}")
    else:
        print(f"[WARN] No payout rows scraped; leaving existing {PAYOUTS_CSV} unchanged")
    return payouts


def load_tracked_companies():
    """Companies we track from dividend calendar"""
    if not os.path.exists(DIVIDEND_CSV):
        return None
    companies = set()
    with open(DIVIDEND_CSV, "r", encoding="utf-8") as f:
        r = csv.DictReader(f)
        for row in r:
            c = (row.get("Company") or row.get("company") or "").strip()
            if c:
                companies.add(c)
    return companies if companies else None


def _parse_historical_row(row):
    cols = row.query_selector_all("td")
    if len(cols) < 9:
        return None
    symbol = cols[0].inner_text().strip()
    if not symbol or len(symbol) > 24 or "\n" in symbol:
        return None
    low = symbol.lower()
    if low in ("symbol", "company", "sr", "#", "no.", "no"):
        return None
    return {
        "date": _karachi_today(),
        "symbol": symbol,
        "ldcp": cols[1].inner_text().strip(),
        "open": cols[2].inner_text().strip(),
        "high": cols[3].inner_text().strip(),
        "low": cols[4].inner_text().strip(),
        "close": cols[5].inner_text().strip(),
        "change": cols[6].inner_text().strip(),
        "change_pct": cols[7].inner_text().strip(),
        "volume": cols[8].inner_text().strip(),
    }


def _set_historical_page_size(page):
    """Prefer 'All' rows; else largest numeric page size (DataTables)."""
    sel = "select[name='historicalTable_length']"
    page.wait_for_selector(sel, timeout=30000)
    options = page.eval_on_selector(
        sel,
        "el => [...el.options].map(o => ({ value: o.value, text: (o.textContent || '').trim() }))",
    )
    pick = None
    for candidate in ("-1", "500", "250", "100"):
        if any(o.get("value") == candidate for o in options):
            pick = candidate
            break
    if not pick:
        nums = []
        for o in options:
            v = str(o.get("value", ""))
            if v.isdigit():
                nums.append(int(v))
        if nums:
            pick = str(max(nums))
    if pick:
        page.select_option(sel, pick)
        print(f"historicalTable page size set to {pick!r}")
        time.sleep(3)
        try:
            page.wait_for_function(
                "() => { const p = document.querySelector('#historicalTable_processing'); "
                "return !p || p.style.display === 'none' || getComputedStyle(p).display === 'none'; }",
                timeout=20000,
            )
        except Exception:
            time.sleep(2)
    return pick


def _historical_total_entries(page):
    try:
        info_el = page.query_selector("#historicalTable_info")
        if not info_el:
            return None
        m = re.search(r"of\s+([\d,]+)\s+entries", info_el.inner_text() or "")
        if m:
            return int(m.group(1).replace(",", ""))
    except Exception:
        pass
    return None


def _click_historical_next(page):
    selectors = [
        "#historicalTable_next:not(.disabled)",
        "#historicalTable_wrapper li.paginate_button.next:not(.disabled)",
        "#historicalTable_wrapper .paginate_button.next:not(.disabled)",
    ]
    for sel in selectors:
        loc = page.locator(sel).first
        if loc.count() == 0:
            continue
        try:
            loc.click(timeout=10000)
            return True
        except Exception:
            continue
    return False


def _http_get_bytes(url, referer=DOWNLOADS_URL, timeout=90):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": HTTP_UA,
            "Accept": "*/*",
            "Referer": referer,
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def _clean_num(s):
    if s is None or (isinstance(s, float) and pd.isna(s)):
        return 0.0
    text = str(s).replace(",", "").replace("%", "").strip()
    if not text:
        return 0.0
    try:
        return float(text)
    except ValueError:
        return 0.0


def _is_ready_equity_symbol(symbol, board_code=""):
    sym = (symbol or "").strip().upper()
    if not sym or len(sym) > 24:
        return False
    if _FUTURE_SUFFIX.search(sym):
        return False
    if str(board_code).strip() == "40":
        return False
    return True


def _prior_closes_from_daily_prices(before_date):
    """Map symbol -> most recent close before before_date from daily_prices.csv."""
    daily_path = os.path.join(DATA_DIR, "daily_prices.csv")
    best = {}
    if not os.path.exists(daily_path):
        return best
    with open(daily_path, "r", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            sym = (row.get("Company") or row.get("symbol") or "").strip().upper()
            rd = row.get("Date") or row.get("date")
            if not sym or not rd or rd >= before_date:
                continue
            try:
                px = float(str(row.get("Price") or row.get("price") or "0").replace(",", ""))
            except ValueError:
                continue
            if px <= 0:
                continue
            prev = best.get(sym)
            if not prev or rd > prev[0]:
                best[sym] = (rd, px)
    return {sym: px for sym, (_d, px) in best.items()}


def _parse_mkt_summary_zip(raw_bytes, trade_date):
    """Parse official PSX mkt_summary .Z (zip) → list of price dicts."""
    dataset = []
    with zipfile.ZipFile(io.BytesIO(raw_bytes)) as zf:
        names = zf.namelist()
        lis_name = next((n for n in names if n.lower().endswith(".lis")), None)
        if not lis_name:
            raise RuntimeError(f"No .lis in mkt_summary archive ({names})")
        text = zf.read(lis_name).decode("utf-8", "ignore")

    prior = _prior_closes_from_daily_prices(trade_date)
    for line in text.splitlines():
        line = line.strip()
        if not line or "|" not in line:
            continue
        parts = line.split("|")
        if len(parts) < 9:
            continue
        symbol = parts[1].strip().upper()
        board = parts[2].strip()
        if not _is_ready_equity_symbol(symbol, board):
            continue
        open_px = _clean_num(parts[4])
        high = _clean_num(parts[5])
        low = _clean_num(parts[6])
        close = _clean_num(parts[7])
        volume = parts[8].strip().replace(",", "")
        if close <= 0:
            continue
        ldcp = prior.get(symbol) or open_px or close
        change = close - ldcp
        change_pct = (change / ldcp * 100.0) if ldcp else 0.0
        dataset.append(
            {
                "date": trade_date,
                "symbol": symbol,
                "ldcp": f"{ldcp:.2f}",
                "open": f"{open_px:.2f}",
                "high": f"{high:.2f}",
                "low": f"{low:.2f}",
                "close": f"{close:.2f}",
                "change": f"{change:.2f}",
                "change_pct": f"{change_pct:.2f}%",
                "volume": volume,
            }
        )
    return dataset


def scrape_psx_from_mkt_summary(trade_date=None, lookback_days=5):
    """
    Primary path: official daily market summary download (no Playwright).
    URL: https://dps.psx.com.pk/download/mkt_summary/YYYY-MM-DD.Z
    """
    base = trade_date or _karachi_today()
    last_err = None
    for offset in range(lookback_days):
        d = datetime.strptime(base, "%Y-%m-%d") - timedelta(days=offset)
        day = d.strftime("%Y-%m-%d")
        # Skip weekends quickly
        if d.weekday() >= 5:
            continue
        url = MKT_SUMMARY_URL.format(date=day)
        print(f"Downloading PSX mkt_summary {day} ...")
        try:
            raw = _http_get_bytes(url)
        except urllib.error.HTTPError as e:
            last_err = e
            print(f"[WARN] mkt_summary {day}: HTTP {e.code}")
            continue
        except Exception as e:
            last_err = e
            print(f"[WARN] mkt_summary {day}: {e}")
            continue
        if not raw or raw[:2] != b"PK":
            last_err = RuntimeError(f"Unexpected archive for {day} (len={len(raw) if raw else 0})")
            print(f"[WARN] {last_err}")
            continue
        dataset = _parse_mkt_summary_zip(raw, day)
        if len(dataset) < 200:
            last_err = RuntimeError(f"Too few rows in mkt_summary {day}: {len(dataset)}")
            print(f"[WARN] {last_err}")
            continue
        print(f"Parsed mkt_summary {day}: {len(dataset)} ready equities")
        return dataset, day
    raise RuntimeError(f"mkt_summary download failed for {base} (±{lookback_days}d): {last_err}")


def scrape_psx_from_historical_browser():
    """Fallback: Playwright scrape of dps.psx.com.pk/historical DataTable."""
    dataset = []
    seen = set()
    with sync_playwright() as p:
        browser = _launch_chromium(p)
        page = browser.new_page(
            user_agent=HTTP_UA,
            extra_http_headers={"Accept-Language": "en-US,en;q=0.9"},
        )

        print("Opening PSX historical page (Playwright fallback)...")
        _goto_with_retries(page, URL, attempts=4, timeout=90000)
        try:
            page.wait_for_load_state("networkidle", timeout=20000)
        except Exception:
            pass

        page.wait_for_selector("#historicalTable tbody tr", timeout=60000)
        try:
            page.click("#historicalSearchBtn", timeout=5000)
            time.sleep(2)
            page.wait_for_selector("#historicalTable tbody tr", timeout=30000)
        except Exception:
            pass
        _set_historical_page_size(page)

        total_expected = _historical_total_entries(page)
        if total_expected:
            print(f"PSX historical table reports {total_expected} entries")

        for page_idx in range(80):
            rows = page.query_selector_all("#historicalTable tbody tr")
            added = 0
            for row in rows:
                rec = _parse_historical_row(row)
                if not rec:
                    continue
                sym = rec["symbol"]
                if sym in seen:
                    continue
                seen.add(sym)
                dataset.append(rec)
                added += 1

            print(f"Page {page_idx + 1}: +{added} symbols (total {len(seen)})")

            if total_expected and len(seen) >= total_expected:
                break
            if added == 0:
                break
            if not _click_historical_next(page):
                break
            time.sleep(2)
            try:
                page.wait_for_function(
                    "() => { const p = document.querySelector('#historicalTable_processing'); "
                    "return !p || p.style.display === 'none' || getComputedStyle(p).display === 'none'; }",
                    timeout=20000,
                )
            except Exception:
                time.sleep(2)

        browser.close()

    return dataset


def _write_price_outputs(dataset):
    """Persist psx_full_dataset / daily_prices / price_changes and optional GitHub push."""
    min_expected = 350
    if len(dataset) < min_expected:
        print(
            f"[WARN] Only {len(dataset)} symbols scraped (< {min_expected}); "
            "source may be incomplete"
        )
    else:
        print(f"Scraped full PSX board: {len(dataset)} symbols")

    df = pd.DataFrame(dataset)
    if df.empty:
        raise RuntimeError("No price rows to write")
    os.makedirs(DATA_DIR, exist_ok=True)
    full_path = os.path.join(DATA_DIR, "psx_full_dataset.csv")
    df.to_csv(full_path, index=False)
    print(f"Saved {len(df)} rows to {full_path}")

    today = str(df.iloc[0].get("date") or _karachi_today())
    if ZoneInfo is not None:
        now_khi = datetime.now(ZoneInfo("Asia/Karachi"))
        yesterday = (now_khi - timedelta(days=1)).strftime("%Y-%m-%d")
        cutoff = (now_khi - timedelta(days=14)).strftime("%Y-%m-%d")
    else:
        yesterday = (datetime.today() - timedelta(days=1)).strftime("%Y-%m-%d")
        cutoff = (datetime.today() - timedelta(days=14)).strftime("%Y-%m-%d")

    daily_prices = []
    price_changes = []
    for _, r in df.iterrows():
        sym = r["symbol"]
        close = _clean_num(r["close"])
        prev = _clean_num(r["ldcp"])
        chg = _clean_num(r["change"])
        chg_pct = _clean_num(r["change_pct"])
        if close > 0:
            daily_prices.append({"Company": sym, "Date": today, "Price": close})
        if prev > 0:
            daily_prices.append({"Company": sym, "Date": yesterday, "Price": prev})
        if prev > 0 and close > 0:
            price_changes.append(
                {
                    "Company": sym,
                    "Price": round(close, 2),
                    "PreviousPrice": round(prev, 2),
                    "Change": round(chg, 2),
                    "ChangePct": round(chg_pct, 2),
                    "Date": today,
                }
            )

    daily_path = os.path.join(DATA_DIR, "daily_prices.csv")
    existing = []
    if os.path.exists(daily_path):
        with open(daily_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                rd = row.get("Date") or row.get("date")
                if rd and rd != today and rd >= cutoff:
                    existing.append(row)
    today_rows = [{"Company": d["Company"], "Date": d["Date"], "Price": d["Price"]} for d in daily_prices]
    by_key = {f"{r['Company']}|{r['Date']}": r for r in existing}
    for r in today_rows:
        by_key[f"{r['Company']}|{r['Date']}"] = r
    merged = sorted(by_key.values(), key=lambda x: (x["Date"], x["Company"]))
    with open(daily_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["Company", "Date", "Price"])
        w.writeheader()
        w.writerows(merged)

    changes_path = os.path.join(DATA_DIR, "price_changes.csv")
    price_changes.sort(key=lambda x: abs(x["ChangePct"]), reverse=True)
    with open(changes_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(
            f,
            fieldnames=["Company", "Price", "PreviousPrice", "Change", "ChangePct", "Date"],
        )
        w.writeheader()
        w.writerows(price_changes)

    print(
        f"Updated daily_prices ({len(daily_prices)} rows written), "
        f"price_changes ({len(price_changes)} with change) for {today}"
    )

    token = os.environ.get("GITHUB_TOKEN")
    repo = os.environ.get("GITHUB_REPO", "AmmarJamshed/DividendFlowPK")
    if token:
        push_to_github(token, repo)

    return len(df)


def scrape_psx():
    """Fetch PSX closing board — prefer official mkt_summary download, else Playwright."""
    dataset = None
    try:
        dataset, used_day = scrape_psx_from_mkt_summary()
        print(f"[ok] Primary source mkt_summary ({used_day})")
    except Exception as e:
        print(f"[WARN] mkt_summary path failed: {e}")
        print("[WARN] Falling back to Playwright historical scrape...")
        dataset = scrape_psx_from_historical_browser()
    return _write_price_outputs(dataset)


def push_to_github(token, repo):
    """Push price CSVs to GitHub via API"""
    try:
        ts = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S")
        msg = f"PSX price scraped: {ts}"

        gh_headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "User-Agent": "DividendFlowPK-psx-scraper",
            "X-GitHub-Api-Version": "2022-11-28",
        }

        def get_sha(path):
            try:
                req = urllib.request.Request(
                    f"https://api.github.com/repos/{repo}/contents/{path}",
                    headers=gh_headers,
                )
                with urllib.request.urlopen(req, timeout=30) as r:
                    return json.loads(r.read())["sha"]
            except Exception:
                return None

        def update_file(path, content):
            payload = {"message": msg, "content": base64.b64encode(content.encode("utf-8")).decode("utf-8")}
            sha = get_sha(path)
            if sha:
                payload["sha"] = sha
            req = urllib.request.Request(
                f"https://api.github.com/repos/{repo}/contents/{path}",
                data=json.dumps(payload).encode(),
                headers={**gh_headers, "Content-Type": "application/json"},
                method="PUT",
            )
            urllib.request.urlopen(req, timeout=90)

        for path in ["data/prices/daily_prices.csv", "data/prices/price_changes.csv", "data/prices/psx_full_dataset.csv", "data/dividends/psx_payouts.csv"]:
            fp = os.path.join(os.path.dirname(__file__), path)
            if os.path.exists(fp):
                with open(fp, "r", encoding="utf-8") as f:
                    update_file(path, f.read())
        print("Pushed to GitHub:", msg)
    except Exception as e:
        print("GitHub push failed:", e)


if __name__ == "__main__":
    from send_email import send_email
    try:
        payouts_count = 0
        skip_payouts = os.environ.get("PSX_SKIP_PAYOUTS", "").lower() in ("1", "true", "yes")
        if skip_payouts:
            print("[INFO] PSX_SKIP_PAYOUTS set — skipping Playwright payouts scrape")
        else:
            try:
                payouts_count = len(scrape_psx_payouts())
            except Exception as pe:
                print(f"[WARN] Payout scrape failed (continuing with historical prices): {pe}")
        prices_count = scrape_psx()
        summary = f"{payouts_count} payouts, {prices_count} prices scraped"
        send_email(success=True, summary=summary)
    except Exception as e:
        print(f"[Error] {e}")
        send_email(success=False, error=str(e))
        raise