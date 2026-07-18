"""
divflowpsx — WITHDRAWN

This package has been temporarily removed from public use.
See https://dividendflow.pk and docs/DIVFLOWPSX_REBUILD.md in the DividendFlowPK repo.
"""

__version__ = "0.2.0"

_MSG = (
    "divflowpsx has been withdrawn temporarily. "
    "Dividend Flow PK is offline to become something far bigger — a surprise. "
    "Subscribe for news at https://dividendflow.pk"
)


def __getattr__(name: str):
    raise RuntimeError(_MSG)


def get_board(*_a, **_k):
    raise RuntimeError(_MSG)


def get_quote(*_a, **_k):
    raise RuntimeError(_MSG)


def get_changes(*_a, **_k):
    raise RuntimeError(_MSG)


def get_payouts(*_a, **_k):
    raise RuntimeError(_MSG)


class Client:
    def __init__(self, *args, **kwargs):
        raise RuntimeError(_MSG)
