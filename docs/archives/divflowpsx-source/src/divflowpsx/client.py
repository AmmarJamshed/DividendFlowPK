"""High-level Client with enforced delay."""

from __future__ import annotations

from typing import Any

import pandas as pd

from .delay import DelayGate
from . import scraper


class Client:
    """
    PSX market data client.

    Data is delayed by at least ``delay_seconds`` (default 10).
    Not for live trading — research / education only.
    """

    def __init__(self, delay_seconds: float = 10.0, use_cache: bool = True):
        self.delay = DelayGate(delay_seconds=delay_seconds)
        self.use_cache = use_cache
        self.delay_seconds = float(delay_seconds)

    def _meta(self, source: str, rows: int) -> dict[str, Any]:
        return {
            "source": source,
            "exchange": "PSX",
            "delayed": True,
            "delay_seconds": self.delay_seconds,
            "as_of_utc": self.delay.utc_now().isoformat(),
            "disclaimer": "Delayed data for research only — not buy/sell advice.",
            "rows": rows,
        }

    def get_board(self, refresh: bool = False) -> pd.DataFrame:
        """Return the full PSX board (OHLC, change, volume) as a DataFrame."""
        if self.use_cache and not refresh:
            cached, meta = self.delay.get_cache()
            if cached is not None and meta and meta.get("source") == "board":
                return cached.copy()

        self.delay.wait_before_fetch()
        self.delay.mark_fetched()
        df = scraper.scrape_board()
        self.delay.apply_return_delay()
        meta = self._meta("board", len(df))
        df.attrs["divflowpsx"] = meta
        if self.use_cache:
            self.delay.store_cache(df.copy(), meta)
        return df

    def get_quote(self, symbol: str, refresh: bool = False) -> dict[str, Any] | None:
        """Return a single symbol quote dict, or None if not found."""
        sym = str(symbol or "").strip().upper()
        if not sym:
            return None
        board = self.get_board(refresh=refresh)
        hit = board[board["symbol"].str.upper() == sym]
        if hit.empty:
            return None
        row = hit.iloc[0].to_dict()
        row["delayed"] = True
        row["delay_seconds"] = self.delay_seconds
        row["disclaimer"] = "Delayed data for research only — not buy/sell advice."
        return row

    def get_changes(self, refresh: bool = False) -> pd.DataFrame:
        """Session movers derived from the delayed board."""
        board = self.get_board(refresh=refresh)
        return scraper.board_to_changes(board)

    def get_payouts(self, refresh: bool = False) -> pd.DataFrame:
        """PSX dividend / payout announcements."""
        cache_key = "payouts"
        if self.use_cache and not refresh:
            cached, meta = self.delay.get_cache()
            if cached is not None and meta and meta.get("source") == cache_key:
                return cached.copy()

        self.delay.wait_before_fetch()
        self.delay.mark_fetched()
        df = scraper.scrape_payouts()
        self.delay.apply_return_delay()
        meta = self._meta(cache_key, len(df))
        df.attrs["divflowpsx"] = meta
        if self.use_cache:
            self.delay.store_cache(df.copy(), meta)
        return df
