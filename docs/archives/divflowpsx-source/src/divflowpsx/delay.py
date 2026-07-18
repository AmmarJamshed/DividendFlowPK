"""Enforce minimum data delay (default 10 seconds)."""

from __future__ import annotations

import threading
import time
from datetime import datetime, timezone
from typing import Any

from . import progress


class DelayGate:
    """Tracks last fetch and enforces a minimum delay before fresh data is returned."""

    def __init__(self, delay_seconds: float = 10.0):
        if delay_seconds < 0:
            raise ValueError("delay_seconds must be >= 0")
        self.delay_seconds = float(delay_seconds)
        self._lock = threading.Lock()
        self._last_fetch_monotonic: float | None = None
        self._cache: Any = None
        self._cache_meta: dict | None = None

    def wait_before_fetch(self) -> None:
        """Sleep so consecutive network scrapes are at least `delay_seconds` apart."""
        with self._lock:
            now = time.monotonic()
            if self._last_fetch_monotonic is None:
                return
            elapsed = now - self._last_fetch_monotonic
            remaining = self.delay_seconds - elapsed
        if remaining > 0:
            progress.countdown(remaining, desc="Rate limit")

    def mark_fetched(self) -> None:
        with self._lock:
            self._last_fetch_monotonic = time.monotonic()

    def apply_return_delay(self, scraped_at: datetime | None = None) -> None:
        """Ensure returned data is at least `delay_seconds` old (with progress bar)."""
        if self.delay_seconds <= 0:
            return
        with self._lock:
            started = self._last_fetch_monotonic
        if started is None:
            progress.countdown(self.delay_seconds, desc="Delay (≥10s)")
            return
        elapsed = time.monotonic() - started
        remaining = self.delay_seconds - elapsed
        if remaining > 0:
            progress.countdown(remaining, desc="Delay (≥10s)")

    def store_cache(self, payload: Any, meta: dict) -> None:
        with self._lock:
            self._cache = payload
            self._cache_meta = meta

    def get_cache(self) -> tuple[Any, dict | None]:
        with self._lock:
            return self._cache, self._cache_meta

    @staticmethod
    def utc_now() -> datetime:
        return datetime.now(timezone.utc)
