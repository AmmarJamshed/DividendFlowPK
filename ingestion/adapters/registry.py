"""Exchange metadata, schedules (UTC + PKT), and yfinance settings."""
from __future__ import annotations

# Market close (local) + 30 min settlement buffer → ingest UTC cron (GitHub Actions)
# PKT = UTC+5 (no DST). US/UK times vary with DST; cron picks safe post-close UTC slot.

EXCHANGES = {
    "NYSE": {
        "code": "NYSE",
        "currency": "USD",
        "yfinance_suffix": "",
        "timezone": "America/New_York",
        "market_close_local": "16:00",
        "ingest_utc": "22:00",
        "ingest_pkt": "03:00 next day",
        "ingest_cron": "0 22 * * 1-5",
        "weekdays_utc": "1-5",
        "notes": "Close 16:00 ET → ingest 22:00 UTC (03:00 PKT Tue–Sat). Safe across EST/EDT.",
    },
    "NASDAQ": {
        "code": "NASDAQ",
        "currency": "USD",
        "yfinance_suffix": "",
        "timezone": "America/New_York",
        "market_close_local": "16:00",
        "ingest_utc": "22:30",
        "ingest_pkt": "03:30 next day",
        "ingest_cron": "30 22 * * 1-5",
        "weekdays_utc": "1-5",
        "notes": "Staggered 30 min after NYSE job to spread API load.",
    },
    "HKEX": {
        "code": "HKEX",
        "currency": "HKD",
        "yfinance_suffix": ".HK",
        "timezone": "Asia/Hong_Kong",
        "market_close_local": "16:00",
        "ingest_utc": "08:30",
        "ingest_pkt": "13:30",
        "ingest_cron": "30 8 * * 1-5",
        "weekdays_utc": "1-5",
        "notes": "Close 16:00 HKT (13:00 PKT) → ingest 13:30 PKT same day.",
    },
    "LSE": {
        "code": "LSE",
        "currency": "GBP",
        "yfinance_suffix": ".L",
        "timezone": "Europe/London",
        "market_close_local": "16:30",
        "ingest_utc": "17:00",
        "ingest_pkt": "22:00",
        "ingest_cron": "0 17 * * 1-5",
        "weekdays_utc": "1-5",
        "notes": "Close 16:30 London → ingest 17:00 UTC (22:00 PKT). Safe across GMT/BST.",
    },
    "TADAWUL": {
        "code": "TADAWUL",
        "currency": "SAR",
        "yfinance_suffix": ".SR",
        "timezone": "Asia/Riyadh",
        "market_close_local": "15:00",
        "ingest_utc": "12:30",
        "ingest_pkt": "17:30",
        "ingest_cron": "30 12 * * 0-4",
        "weekdays_utc": "0-4",
        "symbols": [
            "2222.SR", "1120.SR", "2010.SR", "1180.SR", "7010.SR", "1211.SR",
            "1010.SR", "4030.SR", "2082.SR", "2280.SR", "1150.SR", "1020.SR",
            "2350.SR", "4200.SR", "8230.SR",
        ],
    },
    "TSE": {
        "code": "TSE",
        "currency": "JPY",
        "yfinance_suffix": ".T",
        "timezone": "Asia/Tokyo",
        "market_close_local": "15:00",
        "ingest_utc": "06:30",
        "ingest_pkt": "11:30",
        "ingest_cron": "30 6 * * 1-5",
        "weekdays_utc": "1-5",
        "symbols": ["7203.T", "6758.T", "9984.T", "6861.T", "8306.T"],
    },
    "SSE": {
        "code": "SSE",
        "currency": "CNY",
        "yfinance_suffix": ".SS",
        "timezone": "Asia/Shanghai",
        "market_close_local": "15:00",
        "ingest_utc": "07:30",
        "ingest_pkt": "12:30",
        "ingest_cron": "30 7 * * 1-5",
        "weekdays_utc": "1-5",
        "symbols": ["600519.SS", "601318.SS", "600036.SS", "601166.SS", "600900.SS"],
    },
}

FULL_UNIVERSE_EXCHANGES = frozenset({"NYSE", "NASDAQ", "HKEX", "LSE"})


def get_exchange(code: str) -> dict:
    key = code.upper()
    if key not in EXCHANGES:
        raise ValueError(f"Unknown exchange: {code}")
    return EXCHANGES[key]


def list_yfinance_exchanges() -> list[str]:
    return list(EXCHANGES.keys())
