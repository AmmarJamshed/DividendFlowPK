#!/usr/bin/env python3
"""
Sync dividend history + profiles from yfinance into Supabase.

Sources per ticker:
  - Ticker.dividends  → historical cash dividend amounts + ex-dates
  - Ticker.info       → dividendRate, dividendYield, exDividendDate, payoutFrequency

Not all companies pay quarterly (monthly REITs, semi-annual UK/HK, annual, specials).
Frequency is inferred from payment history gaps.
"""
from __future__ import annotations

import os
import sys
import time
from datetime import datetime, timezone
from statistics import median

import yfinance as yf
from dotenv import load_dotenv
from supabase import create_client

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "ingestion"))

from adapters.registry import EXCHANGES, FULL_UNIVERSE_EXCHANGES, get_exchange  # noqa: E402
from adapters.symbol_universe import shard  # noqa: E402

load_dotenv(os.path.join(ROOT, "backend", ".env"))

URL = os.environ.get("SUPABASE_URL")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SECRET_KEY")
SLEEP = float(os.environ.get("YF_DIV_SLEEP", "0.15"))
HISTORY_YEARS = int(os.environ.get("DIVIDEND_HISTORY_YEARS", "10"))


def sb():
    if not URL or not KEY:
        raise SystemExit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
    return create_client(URL, KEY)


def yahoo_ticker(symbol: str, exchange_code: str) -> str:
    cfg = get_exchange(exchange_code)
    sym = symbol.strip().upper()
    suffix = cfg.get("yfinance_suffix") or cfg.get("yfinance_suffix", "")
    if exchange_code == "HKEX":
        return f"{sym.zfill(4)}.HK"
    if exchange_code == "LSE":
        return sym if sym.endswith(".L") else f"{sym}.L"
    if exchange_code == "TADAWUL":
        return sym if sym.endswith(".SR") else f"{sym}.SR"
    if exchange_code in ("TSE",):
        return sym if sym.endswith(".T") else f"{sym}.T"
    if exchange_code == "SSE":
        return sym if sym.endswith(".SS") else f"{sym}.SS"
    return sym


def detect_frequency(gap_days: list[float]) -> str:
    if not gap_days:
        return "unknown"
    avg = median(gap_days)
    if avg < 45:
        return "monthly"
    if avg < 120:
        return "quarterly"
    if avg < 220:
        return "semi-annual"
    return "annual"


def parse_info_frequency(info: dict) -> str | None:
    raw = info.get("dividendFrequency") or info.get("payoutFrequency")
    if not raw:
        return None
    s = str(raw).lower()
    if "month" in s:
        return "monthly"
    if "quarter" in s or "qtr" in s:
        return "quarterly"
    if "semi" in s or "half" in s:
        return "semi-annual"
    if "annual" in s or "year" in s:
        return "annual"
    return s


def load_securities(client, exchange_code: str) -> list[dict]:
    ex = client.table("exchanges").select("id").eq("code", exchange_code).single().execute().data
    rows = (
        client.table("securities")
        .select("id, symbol, name")
        .eq("exchange_id", ex["id"])
        .eq("active", True)
        .limit(50000)
        .execute()
        .data
    )
    return rows or []


def upsert_events(client, sec_id: str, events: list[dict], currency: str, frequency: str, now: str) -> int:
    n = 0
    for ev in events:
        payload = {
            "security_id": sec_id,
            "ex_date": ev["ex_date"],
            "payment_date": ev["payment_date"],
            "amount": ev["amount"],
            "currency": currency,
            "frequency": frequency,
            "dividend_type": ev.get("type", "regular"),
            "source": "yfinance",
            "scraped_at": now,
        }
        try:
            client.table("dividend_events").upsert(payload, on_conflict="security_id,ex_date,amount").execute()
            n += 1
        except Exception as exc:
            print(f"    event upsert skip: {exc}")
    return n


def upsert_calendar_from_events(client, sec_id: str, events: list[dict], price: float | None, now: str):
    """Aggregate payment history into dividend_calendar rows (year × month)."""
    buckets: dict[tuple[int, int], float] = {}
    for ev in events:
        d = ev.get("payment_date") or ev.get("ex_date")
        if not d:
            continue
        dt = datetime.strptime(d, "%Y-%m-%d")
        key = (dt.year, dt.month)
        buckets[key] = buckets.get(key, 0) + float(ev["amount"])

    for (year, month), total in buckets.items():
        div_yield = None
        if price and price > 0:
            div_yield = round((total / price) * 100, 4)
        client.table("dividend_calendar").upsert(
            {
                "security_id": sec_id,
                "dividend_per_share": round(total, 6),
                "payment_month": month,
                "dividend_yield": div_yield,
                "price": price,
                "year": year,
                "source": "yfinance",
                "scraped_at": now,
            },
            on_conflict="security_id,year,payment_month",
        ).execute()


def sync_security(client, sec_id: str, symbol: str, exchange_code: str, currency: str, now: str) -> tuple[int, bool]:
    ticker_str = yahoo_ticker(symbol, exchange_code)
    try:
        t = yf.Ticker(ticker_str)
        divs = t.dividends
        info = t.info or {}
    except Exception as exc:
        print(f"  skip {ticker_str}: {exc}")
        return 0, False

    if divs is None or divs.empty:
        rate = info.get("dividendRate") or 0
        if not rate or rate <= 0:
            return 0, False

    events = []
    if divs is not None and not divs.empty:
        cutoff = datetime.now(timezone.utc).replace(tzinfo=None).year - HISTORY_YEARS
        for dt, amount in divs.items():
            ex = dt.to_pydatetime().replace(tzinfo=None)
            if ex.year < cutoff:
                continue
            amt = float(amount)
            if amt <= 0:
                continue
            events.append(
                {
                    "ex_date": ex.strftime("%Y-%m-%d"),
                    "payment_date": ex.strftime("%Y-%m-%d"),
                    "amount": round(amt, 6),
                    "type": "regular",
                }
            )

    dates = sorted([e["ex_date"] for e in events])
    gaps = []
    for i in range(1, len(dates)):
        d0 = datetime.strptime(dates[i - 1], "%Y-%m-%d")
        d1 = datetime.strptime(dates[i], "%Y-%m-%d")
        gaps.append((d1 - d0).days)

    freq = parse_info_frequency(info) or detect_frequency(gaps)

    n_events = upsert_events(client, sec_id, events, currency, freq, now)

    trailing_12m = sum(e["amount"] for e in events[-4:]) if events else None
    annual_rate = info.get("dividendRate")
    div_yield = info.get("dividendYield")
    if div_yield is not None and div_yield < 1:
        div_yield = float(div_yield) * 100

    ex_div = info.get("exDividendDate")
    if isinstance(ex_div, (int, float)):
        ex_div = datetime.utcfromtimestamp(ex_div).strftime("%Y-%m-%d")
    elif hasattr(ex_div, "strftime"):
        ex_div = ex_div.strftime("%Y-%m-%d")
    else:
        ex_div = None

    client.table("dividend_profiles").upsert(
        {
            "security_id": sec_id,
            "annual_rate": annual_rate,
            "dividend_yield": div_yield,
            "frequency": freq,
            "ex_dividend_date": ex_div,
            "trailing_12m_total": trailing_12m,
            "last_updated": now,
            "source": "yfinance",
        },
        on_conflict="security_id",
    ).execute()

    price = info.get("regularMarketPrice") or info.get("previousClose")
    if events:
        upsert_calendar_from_events(client, sec_id, events, float(price) if price else None, now)

    return n_events, True


def sync_exchange(exchange_code: str):
    cfg = get_exchange(exchange_code)
    client = sb()
    now = datetime.now(timezone.utc).isoformat()

    shard_index = int(os.environ.get("SHARD", "0"))
    shard_count = int(os.environ.get("SHARD_COUNT", "1"))

    securities = load_securities(client, exchange_code)
    securities = shard(securities, shard_index, shard_count)
    print(f"{exchange_code} dividend sync shard {shard_index + 1}/{shard_count}: {len(securities)} securities")

    total_events = 0
    payers = 0
    for i, sec in enumerate(securities):
        n, ok = sync_security(client, sec["id"], sec["symbol"], exchange_code, cfg["currency"], now)
        total_events += n
        if ok:
            payers += 1
        if (i + 1) % 50 == 0:
            print(f"  progress {i + 1}/{len(securities)} events={total_events} payers={payers}")
        time.sleep(SLEEP)

    client.table("data_sync_log").insert(
        {
            "source_file": f"yfinance/dividends/{exchange_code}",
            "exchange_code": exchange_code,
            "rows_processed": total_events,
            "status": "success",
            "message": f"shard={shard_index}/{shard_count} payers={payers} securities={len(securities)}",
        }
    ).execute()
    print(f"{exchange_code} dividends done: {total_events} events, {payers} paying securities")


def main():
    raw = os.environ.get("EXCHANGES") or " ".join(sys.argv[1:])
    codes = [c.strip().upper() for c in raw.replace(",", " ").split() if c.strip()]
    if not codes:
        codes = ["NYSE", "NASDAQ", "HKEX", "LSE"]
    for code in codes:
        if code not in EXCHANGES:
            print(f"Skip unknown exchange {code}")
            continue
        print(f"Syncing dividends for {code}...")
        sync_exchange(code)


if __name__ == "__main__":
    main()
