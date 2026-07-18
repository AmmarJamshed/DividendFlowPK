"""Playwright browser helpers for PSX DPS portal."""

from __future__ import annotations

import asyncio
import concurrent.futures
import os
import time
from collections.abc import Callable
from typing import TypeVar

T = TypeVar("T")


def _in_colab() -> bool:
    return bool(os.environ.get("COLAB_RELEASE_TAG") or os.path.exists("/content"))


def launch_chromium(playwright):
    """Launch Chromium with Colab/CI-safe flags (full browser, not headless_shell)."""
    os.environ.setdefault("PLAYWRIGHT_CHROMIUM_USE_HEADLESS_SHELL", "0")

    args = [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--mute-audio",
        "--disable-extensions",
    ]
    if _in_colab() or os.environ.get("CI") == "true":
        args.extend(
            [
                "--disable-features=VizDisplayCompositor",
                "--font-render-hinting=none",
            ]
        )

    return playwright.chromium.launch(headless=True, args=args)


def goto_with_retries(page, url: str, attempts: int = 4, timeout: int = 90000) -> None:
    last_err = None
    for i in range(attempts):
        try:
            page.goto(url, timeout=timeout, wait_until="domcontentloaded")
            return
        except Exception as e:  # noqa: BLE001
            last_err = e
            time.sleep(5 * (i + 1))
    raise last_err


def run_sync(fn: Callable[..., T], *args, **kwargs) -> T:
    """
    Run Playwright Sync API safely in scripts AND Jupyter/Colab.

    Colab already has a running asyncio loop; Playwright sync refuses to start
    inside it, so we execute the scrape in a worker thread with its own loop.
    """
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return fn(*args, **kwargs)

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(fn, *args, **kwargs).result()
