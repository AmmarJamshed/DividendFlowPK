#!/usr/bin/env python3
"""Ingest daily closes + metrics via yfinance into Supabase."""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone

import yfinance as yf
from dotenv import load_dotenv
from supabase import create_client

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "ingestion"))

from adapters.registry import get_exchange  # noqa: E402

load_dotenv(os.path.join(ROOT, "backend", ".env"))

URL = os.environ.get("SUPABASE_URL")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SECRET_KEY")
BATCH = 50


def sb():
    if not URL or not KEY:
        raise SystemExit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
    return create_client(URL, KEY)


def exchange_id(client, code: str) -> str:
    row = client.table("exchanges").select("id").eq("code", code).single().execute().data
    return row["id"]


def upsert_security(client, ex_id: str, symbol: str, name: str, sector: str | None):
    sym = symbol.split(".")[0] if "." in symbol and not symbol.endswith(".SR") else symbol
    if symbol.endswith(".SR"):
        sym = symbol.replace(".SR", "")
    payload = {
        "exchange_id": ex_id,
        "symbol": sym.upper(),
        "name": name or sym,
        "sector": sector,
        "active": True,
    }
    client.table("securities").upsert(payload, on_conflict="exchange_id,symbol").execute()
    row = (
        client.table("securities")
        .select("id")
        .eq("exchange_id", ex_id)
        .eq("symbol", sym.upper())
        .single()
        .execute()
        .data
    )
    return row["id"]


def ingest_exchange(code: str):
    cfg = get_exchange(code)
    client = sb()
    ex_id = exchange_id(client, code)
    now = datetime.now(timezone.utc).isoformat()
    n_prices = 0
    n_metrics = 0

    for ticker in cfg["symbols"]:
        t = yf.Ticker(ticker)
        info = t.info or {}
        hist = t.history(period="5d")
        if hist.empty:
            print(f"  skip {ticker}: no history")
            continue

        sym_display = ticker.replace(cfg["yfinance_suffix"], "").upper()
        if cfg["yfinance_suffix"] == ".SR":
            sym_display = ticker.replace(".SR", "").upper()
        sec_id = upsert_security(
            client,
            ex_id,
            sym_display,
            info.get("shortName") or info.get("longName") or sym_display,
            info.get("sector"),
        )

        last = hist.iloc[-1]
        prev = hist.iloc[-2] if len(hist) > 1 else last
        trade_date = hist.index[-1].strftime("%Y-%m-%d")
        close = float(last["Close"])
        prev_close = float(prev["Close"])
        chg = close - prev_close
        chg_pct = (chg / prev_close * 100) if prev_close else 0

        client.table("daily_prices").upsert(
            {
                "security_id": sec_id,
                "trade_date": trade_date,
                "open": float(last["Open"]),
                "high": float(last["High"]),
                "low": float(last["Low"]),
                "close": close,
                "change_amount": round(chg, 4),
                "change_pct": round(chg_pct, 4),
                "volume": int(last["Volume"]) if last["Volume"] == last["Volume"] else None,
                "currency": cfg["currency"],
                "source": "yfinance",
                "scraped_at": now,
            },
            on_conflict="security_id,trade_date",
        ).execute()
        n_prices += 1

        client.table("financial_metrics").upsert(
            {
                "security_id": sec_id,
                "as_of_date": trade_date,
                "market_cap": info.get("marketCap"),
                "pe_ratio": info.get("trailingPE"),
                "eps": info.get("trailingEps"),
                "week_52_high": info.get("fiftyTwoWeekHigh"),
                "week_52_low": info.get("fiftyTwoWeekLow"),
                "dividend_yield": info.get("dividendYield"),
                "source": "yfinance",
                "scraped_at": now,
            },
            on_conflict="security_id,as_of_date",
        ).execute()
        n_metrics += 1

        div_rate = info.get("dividendRate")
        if div_rate and div_rate > 0:
            client.table("dividend_calendar").upsert(
                {
                    "security_id": sec_id,
                    "dividend_per_share": div_rate,
                    "dividend_yield": (info.get("dividendYield") or 0) * 100 if info.get("dividendYield") else None,
                    "payment_month": datetime.now().month,
                    "year": datetime.now().year,
                    "source": "yfinance",
                    "scraped_at": now,
                },
                on_conflict="security_id,year,payment_month",
            ).execute()

        print(f"  ok {ticker} close={close:.2f}")

    client.table("data_sync_log").insert(
        {
            "source_file": f"yfinance/{code}",
            "exchange_code": code,
            "rows_processed": n_prices,
            "status": "success",
            "message": f"metrics={n_metrics}",
        }
    ).execute()
    print(f"{code}: {n_prices} prices, {n_metrics} metrics")


def main():
    codes = sys.argv[1:] or ["NYSE", "NASDAQ"]
    for code in codes:
        print(f"Ingesting {code}...")
        ingest_exchange(code.upper())


if __name__ == "__main__":
    main()
