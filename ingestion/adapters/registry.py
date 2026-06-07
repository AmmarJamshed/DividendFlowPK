"""Exchange registry for global ingestion."""
from __future__ import annotations

EXCHANGES = {
    "NYSE": {
        "code": "NYSE",
        "currency": "USD",
        "yfinance_suffix": "",
        "symbols": ["AAPL", "MSFT", "JPM", "JNJ", "PG", "KO", "XOM", "V", "UNH", "HD"],
    },
    "NASDAQ": {
        "code": "NASDAQ",
        "currency": "USD",
        "yfinance_suffix": "",
        "symbols": ["NVDA", "GOOGL", "AMZN", "META", "TSLA", "AVGO", "COST", "NFLX", "AMD", "PEP"],
    },
    "TADAWUL": {
        "code": "TADAWUL",
        "currency": "SAR",
        "yfinance_suffix": ".SR",
        "symbols": ["2222.SR", "1180.SR", "2010.SR", "1120.SR", "7010.SR"],
    },
    "HKEX": {
        "code": "HKEX",
        "currency": "HKD",
        "yfinance_suffix": ".HK",
        "symbols": ["0700.HK", "9988.HK", "0005.HK", "1299.HK", "0941.HK"],
    },
    "TSE": {
        "code": "TSE",
        "currency": "JPY",
        "yfinance_suffix": ".T",
        "symbols": ["7203.T", "6758.T", "9984.T", "6861.T", "8306.T"],
    },
    "SSE": {
        "code": "SSE",
        "currency": "CNY",
        "yfinance_suffix": ".SS",
        "symbols": ["600519.SS", "601318.SS", "600036.SS", "601166.SS", "600900.SS"],
    },
    "LSE": {
        "code": "LSE",
        "currency": "GBP",
        "yfinance_suffix": ".L",
        "symbols": ["SHEL.L", "AZN.L", "HSBA.L", "ULVR.L", "BP.L"],
    },
}


def get_exchange(code: str) -> dict:
    key = code.upper()
    if key not in EXCHANGES:
        raise ValueError(f"Unknown exchange: {code}")
    return EXCHANGES[key]


def list_yfinance_exchanges() -> list[str]:
    return list(EXCHANGES.keys())
