"""Progress helpers (tqdm) for notebooks and terminals."""

from __future__ import annotations

import time
from contextlib import contextmanager
from typing import Iterator

try:
    from tqdm.auto import tqdm
except ImportError:  # pragma: no cover
    tqdm = None  # type: ignore


@contextmanager
def stage(desc: str, total: int | None = None) -> Iterator:
    """Single-step or multi-step progress bar."""
    if tqdm is None:
        print(desc, flush=True)
        yield None
        return
    bar = tqdm(total=total if total is not None else 1, desc=desc, leave=True)
    try:
        yield bar
        if total is None:
            bar.update(1)
    finally:
        bar.close()


def countdown(seconds: float, desc: str = "Delay") -> None:
    """Visible countdown (used for the mandatory data delay)."""
    seconds = max(0.0, float(seconds))
    if seconds <= 0:
        return
    if tqdm is None:
        print(f"{desc}: waiting {seconds:.0f}s…", flush=True)
        time.sleep(seconds)
        return
    steps = max(1, int(round(seconds)))
    with tqdm(total=steps, desc=desc, leave=True, unit="s") as bar:
        for _ in range(steps):
            time.sleep(1.0 if seconds >= steps else seconds / steps)
            bar.update(1)


def log(msg: str) -> None:
    print(f"[divflowpsx] {msg}", flush=True)
