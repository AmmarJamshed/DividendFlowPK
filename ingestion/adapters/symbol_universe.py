"""Fetch full symbol universes for yfinance ingestion."""
from __future__ import annotations

import io
import re
from typing import Iterable

import pandas as pd
import requests

NASDAQ_LISTED = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"
OTHER_LISTED = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"
HKEX_XLSX = "https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx"
HKEX_FALLBACK_XLSX = (
    "https://raw.githubusercontent.com/LondonMarket/Global-Stock-Symbols/main/HongLongListOfSecurities_300625.xlsx"
)
LSE_CSV = "https://www.londonstockexchange.com/download/list-of-all-london-stock-exchange-securities.csv"
LSE_FALLBACK_CSV = "https://raw.githubusercontent.com/ensbyp/Investor/master/Data/LSE.csv"
LSE_FALLBACK_XLSX = (
    "https://raw.githubusercontent.com/LondonMarket/Global-Stock-Symbols/main/lse_instrument%20list_32.xlsx"
)


def _get_text(url: str, timeout: int = 60) -> str:
    r = requests.get(url, timeout=timeout, headers={"User-Agent": "DividendFlow-Ingest/1.0"})
    r.raise_for_status()
    return r.text


def _clean_yahoo_symbol(sym: str) -> str:
    return re.sub(r"[^A-Za-z0-9.\-^]", "", str(sym).strip())


def fetch_nasdaq_symbols() -> list[str]:
    """All NASDAQ-listed common stocks (yfinance: no suffix)."""
    text = _get_text(NASDAQ_LISTED)
    lines = [ln for ln in text.splitlines() if ln and not ln.startswith("File Creation")]
    df = pd.read_csv(io.StringIO("\n".join(lines)), sep="|")
    df = df[df["Test Issue"] == "N"]
    df = df[df.get("ETF", "N") == "N"]
    syms = []
    for s in df["Symbol"].astype(str):
        s = _clean_yahoo_symbol(s)
        if s and s != "nan":
            syms.append(s)
    return sorted(set(syms))


def fetch_nyse_symbols() -> list[str]:
    """NYSE (+ NYSE American, NYSE Arca) from NASDAQ trader otherlisted feed."""
    text = _get_text(OTHER_LISTED)
    lines = [ln for ln in text.splitlines() if ln and not ln.startswith("File Creation")]
    df = pd.read_csv(io.StringIO("\n".join(lines)), sep="|")
    df = df[df["Test Issue"] == "N"]
    df = df[df.get("ETF", "N") == "N"]
    # N=NYSE, A=NYSE American, P=NYSE Arca
    df = df[df["Exchange"].isin(["N", "A", "P"])]
    syms = []
    for _, row in df.iterrows():
        raw = row.get("NASDAQ Symbol") if pd.notna(row.get("NASDAQ Symbol")) else row.get("Symbol")
        s = _clean_yahoo_symbol(str(raw))
        if s and s.lower() != "nan":
            syms.append(s)
    return sorted(set(syms))


def fetch_hkex_symbols() -> list[str]:
    """HKEX equities as Yahoo tickers (e.g. 0700.HK)."""
    last_err = None
    for url in (HKEX_XLSX, HKEX_FALLBACK_XLSX):
        try:
            r = requests.get(url, timeout=120, headers={"User-Agent": "DividendFlow-Ingest/1.0"})
            r.raise_for_status()
            df = pd.read_excel(io.BytesIO(r.content), sheet_name=0, header=2)
            cols = {c: str(c).strip().lower() for c in df.columns}
            df.columns = [cols[c] for c in df.columns]
            sym_col = next((c for c in df.columns if "stock" in c and "code" in c), df.columns[0])
            type_col = next((c for c in df.columns if "category" in c), None)
            name_col = next((c for c in df.columns if "name" in c), None)
            if type_col:
                cat = df[type_col].astype(str).str.strip().str.lower()
                allowed = cat.isin(["equity", "real estate investment trusts"])
                excluded = cat.str.contains(
                    r"warrant|debt|bond|etf|exchange traded|rights|unit|preference|preferred",
                    case=False,
                    na=False,
                )
                df = df[allowed & ~excluded]
            if name_col:
                nm = df[name_col].astype(str).str.lower()
                df = df[~nm.str.contains(r"\bwarrant\b|\bbond\b|\betf\b|\brights\b", case=False, na=False)]
            syms = []
            for raw in df[sym_col].dropna().astype(str):
                digits = re.sub(r"\D", "", raw.strip())
                if digits and len(digits) <= 5:
                    syms.append(f"{digits.zfill(4)}.HK")
            if syms:
                return sorted(set(syms))
        except Exception as exc:
            last_err = exc
            print(f"HKEX source {url} failed: {exc}")
    raise RuntimeError(f"Could not fetch HKEX symbols: {last_err}")


def fetch_lse_symbols() -> list[str]:
    """LSE equities as Yahoo tickers (e.g. BP.L)."""
    last_err = None
    for url in (LSE_CSV, LSE_FALLBACK_CSV):
        try:
            r = requests.get(url, timeout=120, headers={"User-Agent": "DividendFlow-Ingest/1.0"})
            r.raise_for_status()
            df = pd.read_csv(io.StringIO(r.text) if url.endswith(".csv") else io.BytesIO(r.content))
            syms = _parse_lse_dataframe(df)
            if syms:
                return syms
        except Exception as exc:
            last_err = exc
            print(f"LSE CSV source {url} failed: {exc}")

    try:
        r = requests.get(LSE_FALLBACK_XLSX, timeout=120, headers={"User-Agent": "DividendFlow-Ingest/1.0"})
        r.raise_for_status()
        df = pd.read_excel(io.BytesIO(r.content))
        syms = _parse_lse_dataframe(df)
        if syms:
            return syms
    except Exception as exc:
        last_err = exc
        print(f"LSE XLSX fallback failed: {exc}")

    raise RuntimeError(f"Could not fetch LSE symbol list: {last_err}")


def _parse_lse_dataframe(df: pd.DataFrame) -> list[str]:
    cols_lower = {c: str(c).lower() for c in df.columns}
    sym_col = None
    for c, lc in cols_lower.items():
        if "ticker" in lc or lc in ("symbol", "code") or lc.startswith("symbol"):
            sym_col = c
            break
    if sym_col is None:
        sym_col = df.columns[0]
    syms = []
    for s in df[sym_col].dropna().astype(str):
        s = _clean_yahoo_symbol(s)
        if not s or s.lower() in ("nan", "symbol"):
            continue
        # Skip bonds/debt style tickers (often long descriptions in fallback CSV)
        if len(s) > 12 and " " in s:
            continue
        if not s.endswith(".L"):
            s = f"{s}.L"
        syms.append(s.upper())
    return sorted(set(syms))


def fetch_universe(exchange_code: str) -> list[str]:
    code = exchange_code.upper()
    if code == "NASDAQ":
        return fetch_nasdaq_symbols()
    if code == "NYSE":
        return fetch_nyse_symbols()
    if code == "HKEX":
        return fetch_hkex_symbols()
    if code == "LSE":
        return fetch_lse_symbols()
    raise ValueError(f"No full universe fetcher for {code}")


def shard(symbols: Iterable[str], shard_index: int, shard_count: int) -> list[str]:
    items = list(symbols)
    if shard_count <= 1:
        return items
    return [items[i] for i in range(len(items)) if i % shard_count == shard_index]
