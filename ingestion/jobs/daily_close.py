#!/usr/bin/env python3
"""Ingest daily closes via yfinance (batch) into Supabase — full exchange universes."""
from __future__ import annotations

import os
import sys
import time
from datetime import datetime, timezone

import pandas as pd
import yfinance as yf
from dotenv import load_dotenv
from supabase import create_client

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "ingestion"))

from adapters.registry import FULL_UNIVERSE_EXCHANGES, get_exchange  # noqa: E402
from adapters.symbol_universe import fetch_universe, shard  # noqa: E402

load_dotenv(os.path.join(ROOT, "backend", ".env"))

URL = os.environ.get("SUPABASE_URL")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SECRET_KEY")
DOWNLOAD_BATCH = int(os.environ.get("YF_BATCH_SIZE", "120"))
SLEEP_SEC = float(os.environ.get("YF_BATCH_SLEEP", "0.4"))


def sb():
    if not URL or not KEY:
        raise SystemExit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
    return create_client(URL, KEY)


def exchange_id(client, code: str) -> str:
    row = client.table("exchanges").select("id").eq("code", code).single().execute().data
    return row["id"]


def db_symbol(yahoo_ticker: str, cfg: dict) -> str:
    s = yahoo_ticker.strip().upper()
    suffix = (cfg.get("yfinance_suffix") or "").upper()
    if suffix and s.endswith(suffix):
        return s[: -len(suffix)]
    return s


def upsert_security(client, ex_id: str, symbol: str, name: str | None = None):
    payload = {
        "exchange_id": ex_id,
        "symbol": symbol.upper(),
        "name": name or symbol,
        "active": True,
    }
    client.table("securities").upsert(payload, on_conflict="exchange_id,symbol").execute()
    row = (
        client.table("securities")
        .select("id")
        .eq("exchange_id", ex_id)
        .eq("symbol", symbol.upper())
        .single()
        .execute()
        .data
    )
    return row["id"]


def load_symbols(code: str) -> list[str]:
    cfg = get_exchange(code)
    if code in FULL_UNIVERSE_EXCHANGES:
        print(f"Fetching full {code} symbol universe...")
        symbols = fetch_universe(code)
        print(f"  {len(symbols)} symbols loaded")
        return symbols
    return list(cfg.get("symbols") or [])


def parse_batch_download(data: pd.DataFrame, tickers: list[str]) -> dict[str, pd.DataFrame]:
    out: dict[str, pd.DataFrame] = {}
    if data is None or data.empty:
        return out
    if len(tickers) == 1:
        t = tickers[0]
        if not data.empty:
            out[t] = data
        return out
    # Multi-index columns: (Price, Ticker) or (Ticker, Price) depending on yfinance version
    if isinstance(data.columns, pd.MultiIndex):
        level0 = set(data.columns.get_level_values(0))
        if "Close" in level0 or "Open" in level0:
            for t in tickers:
                try:
                    sub = data.xs(t, axis=1, level=1, drop_level=False)
                    if sub is not None and not sub.empty:
                        out[t] = sub
                except Exception:
                    pass
        else:
            for t in tickers:
                if t in level0:
                    sub = data[t]
                    if sub is not None and not sub.empty:
                        out[t] = sub
    return out


def upsert_price_row(client, sec_id: str, hist: pd.DataFrame, currency: str, now: str) -> bool:
    hist = hist.dropna(how="all")
    if hist.empty:
        return False
    if "Close" not in hist.columns:
        return False
    last = hist.iloc[-1]
    prev = hist.iloc[-2] if len(hist) > 1 else last
    trade_date = hist.index[-1].strftime("%Y-%m-%d")
    close = float(last["Close"])
    prev_close = float(prev["Close"])
    chg = close - prev_close
    chg_pct = (chg / prev_close * 100) if prev_close else 0
    vol = last.get("Volume")
    volume = int(vol) if pd.notna(vol) else None

    client.table("daily_prices").upsert(
        {
            "security_id": sec_id,
            "trade_date": trade_date,
            "open": float(last["Open"]) if pd.notna(last.get("Open")) else None,
            "high": float(last["High"]) if pd.notna(last.get("High")) else None,
            "low": float(last["Low"]) if pd.notna(last.get("Low")) else None,
            "close": close,
            "change_amount": round(chg, 4),
            "change_pct": round(chg_pct, 4),
            "volume": volume,
            "currency": currency,
            "source": "yfinance",
            "scraped_at": now,
        },
        on_conflict="security_id,trade_date",
    ).execute()
    return True


def ingest_exchange(code: str):
    cfg = get_exchange(code)
    client = sb()
    ex_id = exchange_id(client, code)
    now = datetime.now(timezone.utc).isoformat()

    shard_index = int(os.environ.get("SHARD", "0"))
    shard_count = int(os.environ.get("SHARD_COUNT", "1"))
    max_symbols = int(os.environ.get("MAX_SYMBOLS", "0"))

    all_symbols = load_symbols(code)
    if max_symbols > 0:
        all_symbols = all_symbols[:max_symbols]
    symbols = shard(all_symbols, shard_index, shard_count)
    print(f"{code} shard {shard_index + 1}/{shard_count}: {len(symbols)} tickers")

    n_ok = 0
    n_skip = 0

    for i in range(0, len(symbols), DOWNLOAD_BATCH):
        batch = symbols[i : i + DOWNLOAD_BATCH]
        try:
            data = yf.download(
                batch,
                period="5d",
                group_by="column",
                threads=True,
                progress=False,
                auto_adjust=False,
            )
        except Exception as exc:
            print(f"  batch download error: {exc}")
            n_skip += len(batch)
            time.sleep(SLEEP_SEC * 2)
            continue

        parsed = parse_batch_download(data, batch)
        for ticker in batch:
            hist = parsed.get(ticker)
            if hist is None or hist.empty:
                n_skip += 1
                continue
            sym = db_symbol(ticker, cfg)
            try:
                sec_id = upsert_security(client, ex_id, sym, sym)
                if upsert_price_row(client, sec_id, hist, cfg["currency"], now):
                    n_ok += 1
                else:
                    n_skip += 1
            except Exception as exc:
                print(f"  skip {ticker}: {exc}")
                n_skip += 1

        print(f"  batch {i // DOWNLOAD_BATCH + 1}: ok={n_ok} skip={n_skip}")
        time.sleep(SLEEP_SEC)

    client.table("data_sync_log").insert(
        {
            "source_file": f"yfinance/{code}",
            "exchange_code": code,
            "rows_processed": n_ok,
            "status": "success",
            "message": f"shard={shard_index}/{shard_count} skipped={n_skip} total={len(symbols)}",
        }
    ).execute()
    print(f"{code} done: {n_ok} prices upserted, {n_skip} skipped")


def main():
    codes = sys.argv[1:] or ["NYSE"]
    for code in codes:
        print(f"Ingesting {code}...")
        ingest_exchange(code.upper())


if __name__ == "__main__":
    main()
