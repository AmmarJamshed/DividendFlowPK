"""
divflowpsx — delayed Pakistan Stock Exchange (PSX) market data.

All quotes are intentionally delayed by at least 10 seconds (configurable).
Not for live trading. For research and education only.
"""

from .client import Client
from .api import get_board, get_quote, get_payouts, get_changes

__version__ = "0.1.4"
__all__ = [
    "Client",
    "get_board",
    "get_quote",
    "get_payouts",
    "get_changes",
    "__version__",
]

DEFAULT_DELAY_SECONDS = 10
