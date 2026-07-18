"""Scrape PSX DPS historical board and payouts (Playwright)."""

from __future__ import annotations

import calendar
import re
import time
from datetime import datetime, timedelta
from typing import Any

import pandas as pd

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None  # type: ignore

from ._browser import goto_with_retries, launch_chromium, run_sync
from ._ensure_browser import ensure_chromium

HISTORICAL_URL = "https://dps.psx.com.pk/historical"
PAYOUTS_URL = "https://dps.psx.com.pk/payouts"

_MONTH_WORDS = (
    ("january", 1), ("february", 2), ("march", 3), ("april", 4), ("may", 5), ("june", 6),
    ("july", 7), ("august", 8), ("september", 9), ("october", 10), ("november", 11), ("december", 12),
)


def karachi_today() -> str:
    if ZoneInfo is not None:
        return datetime.now(ZoneInfo("Asia/Karachi")).strftime("%Y-%m-%d")
    return datetime.today().strftime("%Y-%m-%d")


def _clean_num(s: Any) -> float:
    if pd.isna(s):
        return 0.0
    text = str(s).replace(",", "").replace("%", "").strip()
    try:
        return float(text)
    except ValueError:
        return 0.0


def _month_num_from_word(word: str) -> int | None:
    w = (word or "").strip().lower()
    if not w:
        return None
    for name, num in _MONTH_WORDS:
        if w.startswith(name[:3]) or name.startswith(w[: min(3, len(w))]):
            return num
    return None


def _parse_book_closure_payment(book_closure_raw: str):
    text = (book_closure_raw or "").replace("\n", " ").strip()
    if not text or text in ("-", "—", "N/A", "TBA"):
        return None
    matches = re.findall(r"(\d{1,2})/(\d{1,2})/(\d{4})", text) or re.findall(
        r"(\d{1,2})-(\d{1,2})-(\d{4})", text
    )
    if not matches:
        return None
    d, m, y = int(matches[-1][0]), int(matches[-1][1]), int(matches[-1][2])
    pay_m, pay_y = (1, y + 1) if m == 12 else (m + 1, y)
    return f"{y}-{m:02d}-{d:02d}", pay_m, pay_y


def _parse_announcement_date_payment(announcement_raw: str):
    m = re.search(r"\b([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})", announcement_raw or "")
    if not m:
        return None
    ann_m = _month_num_from_word(m.group(1))
    if not ann_m:
        return None
    day = int(m.group(2))
    y = int(m.group(3))
    day = min(day, calendar.monthrange(y, ann_m)[1])
    pay_m, pay_y = (1, y + 1) if ann_m == 12 else (ann_m + 1, y)
    return f"{y}-{ann_m:02d}-{day:02d}", pay_m, pay_y


def _parse_payment_dates(book_closure_raw: str, announcement_raw: str):
    return _parse_book_closure_payment(book_closure_raw) or _parse_announcement_date_payment(
        announcement_raw
    )


def _parse_historical_row(row) -> dict | None:
    cols = row.query_selector_all("td")
    if len(cols) < 9:
        return None
    symbol = cols[0].inner_text().strip()
    if not symbol or len(symbol) > 24 or "\n" in symbol:
        return None
    if symbol.lower() in ("symbol", "company", "sr", "#", "no.", "no"):
        return None
    return {
        "date": karachi_today(),
        "symbol": symbol,
        "ldcp": _clean_num(cols[1].inner_text()),
        "open": _clean_num(cols[2].inner_text()),
        "high": _clean_num(cols[3].inner_text()),
        "low": _clean_num(cols[4].inner_text()),
        "close": _clean_num(cols[5].inner_text()),
        "change": _clean_num(cols[6].inner_text()),
        "change_pct": _clean_num(cols[7].inner_text()),
        "volume": _clean_num(cols[8].inner_text()),
    }


def _set_historical_page_size(page) -> str | None:
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
        nums = [int(o["value"]) for o in options if str(o.get("value", "")).isdigit()]
        if nums:
            pick = str(max(nums))
    if pick:
        page.select_option(sel, pick)
        time.sleep(2)
        try:
            page.wait_for_function(
                "() => { const p = document.querySelector('#historicalTable_processing'); "
                "return !p || p.style.display === 'none' || getComputedStyle(p).display === 'none'; }",
                timeout=20000,
            )
        except Exception:
            time.sleep(1)
    return pick


def _historical_total_entries(page) -> int | None:
    try:
        info_el = page.query_selector("#historicalTable_info")
        if not info_el:
            return None
        m = re.search(r"of\s+([\d,]+)\s+entries", info_el.inner_text() or "")
        if m:
            return int(m.group(1).replace(",", ""))
    except Exception:
        return None
    return None


def _click_historical_next(page) -> bool:
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


def scrape_board(max_pages: int = 80) -> pd.DataFrame:
    """Fetch the full PSX historical board as a DataFrame (Colab/Jupyter safe)."""
    return run_sync(_scrape_board_impl, max_pages)


def _scrape_board_impl(max_pages: int = 80) -> pd.DataFrame:
    from playwright.sync_api import sync_playwright

    from . import progress

    ensure_chromium()

    dataset: list[dict] = []
    seen: set[str] = set()

    with progress.stage("Opening PSX historical board"):
        playwright_cm = sync_playwright()
        p = playwright_cm.__enter__()
        browser = launch_chromium(p)
        page = browser.new_page()
        goto_with_retries(page, HISTORICAL_URL)
        try:
            page.wait_for_load_state("networkidle", timeout=20000)
        except Exception:
            pass
        page.wait_for_selector("#historicalTable", timeout=30000)
        _set_historical_page_size(page)
        total_expected = _historical_total_entries(page)

    total_pages = None
    if total_expected:
        # rough page estimate for the bar (DataTables often 100/page after size set)
        total_pages = max(1, min(max_pages, (total_expected + 99) // 100))

    try:
        with progress.stage("Scraping PSX symbols", total=total_pages or max_pages) as bar:
            for page_idx in range(max_pages):
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

                if bar is not None:
                    bar.set_postfix(symbols=len(seen), refresh=False)
                    bar.update(1)

                if total_expected and len(seen) >= total_expected:
                    break
                if added == 0:
                    break
                if not _click_historical_next(page):
                    break
                time.sleep(1.5)
                try:
                    page.wait_for_function(
                        "() => { const p = document.querySelector('#historicalTable_processing'); "
                        "return !p || p.style.display === 'none' || getComputedStyle(p).display === 'none'; }",
                        timeout=20000,
                    )
                except Exception:
                    time.sleep(1)
    finally:
        try:
            browser.close()
        except Exception:
            pass
        try:
            playwright_cm.__exit__(None, None, None)
        except Exception:
            pass

    progress.log(f"Board ready: {len(seen)} symbols")
    df = pd.DataFrame(dataset)
    if not df.empty:
        df = df.sort_values("symbol").reset_index(drop=True)
    return df


def scrape_payouts(max_pages: int = 60) -> pd.DataFrame:
    """Fetch PSX payout announcements as a DataFrame (Colab/Jupyter safe)."""
    return run_sync(_scrape_payouts_impl, max_pages)


def _scrape_payouts_impl(max_pages: int = 60) -> pd.DataFrame:
    from playwright.sync_api import sync_playwright

    from . import progress

    ensure_chromium()

    payouts: list[dict] = []
    seen: set[str] = set()

    with progress.stage("Opening PSX payouts"):
        playwright_cm = sync_playwright()
        p = playwright_cm.__enter__()
        browser = launch_chromium(p)
        page = browser.new_page()
        goto_with_retries(page, PAYOUTS_URL)
        try:
            page.wait_for_load_state("networkidle", timeout=20000)
        except Exception:
            pass
        time.sleep(1)
        page.wait_for_selector("#announcementsTable tbody tr", timeout=30000)

    try:
        with progress.stage("Scraping payouts", total=max_pages) as bar:
            for _ in range(max_pages):
                rows = page.query_selector_all("#announcementsTable tbody tr")
                next_handles = page.query_selector_all("button.form__button.next")
                data_offset = 0
                data_total = 0
                if next_handles:
                    next_el = next_handles[-1]
                    data_offset = int(next_el.get_attribute("data-offset") or 0)
                    data_total = int(next_el.get_attribute("data-total") or 0)

                for row in rows:
                    cols = row.query_selector_all("td")
                    if len(cols) < 6:
                        continue
                    symbol = cols[0].inner_text().strip()
                    company = cols[1].inner_text().strip()
                    sector = cols[2].inner_text().strip()
                    announcement = cols[3].inner_text().strip()
                    ann_date = cols[4].inner_text().strip()
                    book_closure = cols[5].inner_text().strip()
                    key = f"{symbol}|{announcement}|{book_closure}"
                    if not symbol or key in seen:
                        continue
                    seen.add(key)
                    parsed = _parse_payment_dates(book_closure, ann_date)
                    book_end, pay_m, pay_y = (None, None, None)
                    if parsed:
                        book_end, pay_m, pay_y = parsed
                    payouts.append(
                        {
                            "symbol": symbol,
                            "company": company,
                            "sector": sector,
                            "announcement": announcement,
                            "announcement_date": ann_date,
                            "book_closure": book_closure,
                            "book_end": book_end,
                            "payment_month": pay_m,
                            "payment_year": pay_y,
                        }
                    )

                if bar is not None:
                    bar.set_postfix(rows=len(seen), refresh=False)
                    bar.update(1)

                if not next_handles:
                    break
                next_el = next_handles[-1]
                if next_el.get_attribute("disabled") is not None:
                    break
                if data_total and data_offset >= data_total:
                    break
                try:
                    next_el.click()
                except Exception:
                    break
                time.sleep(1.2)
    finally:
        try:
            browser.close()
        except Exception:
            pass
        try:
            playwright_cm.__exit__(None, None, None)
        except Exception:
            pass

    progress.log(f"Payouts ready: {len(seen)} rows")
    return pd.DataFrame(payouts)


def board_to_changes(board: pd.DataFrame) -> pd.DataFrame:
    """Derive session change rows from a board DataFrame."""
    if board is None or board.empty:
        return pd.DataFrame()
    rows = []
    today = karachi_today()
    for _, r in board.iterrows():
        close = float(r.get("close") or 0)
        prev = float(r.get("ldcp") or 0)
        if prev <= 0 or close <= 0:
            continue
        rows.append(
            {
                "symbol": r["symbol"],
                "price": close,
                "previous_price": prev,
                "change": float(r.get("change") or (close - prev)),
                "change_pct": float(r.get("change_pct") or ((close - prev) / prev * 100)),
                "date": r.get("date") or today,
                "volume": float(r.get("volume") or 0),
            }
        )
    return pd.DataFrame(rows)
