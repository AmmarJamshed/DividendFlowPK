"""Module-level convenience API using a shared default client."""

from __future__ import annotations

from .client import Client

_default = Client(delay_seconds=10.0)


def get_board(refresh: bool = False):
    return _default.get_board(refresh=refresh)


def get_quote(symbol: str, refresh: bool = False):
    return _default.get_quote(symbol, refresh=refresh)


def get_changes(refresh: bool = False):
    return _default.get_changes(refresh=refresh)


def get_payouts(refresh: bool = False):
    return _default.get_payouts(refresh=refresh)
