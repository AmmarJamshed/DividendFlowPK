"""Ensure Playwright Chromium is installed (no manual `playwright install` step)."""

from __future__ import annotations

import os
import subprocess
import sys
import threading
from pathlib import Path

from . import progress

_lock = threading.Lock()
_ready = False


def _in_colab() -> bool:
    return bool(os.environ.get("COLAB_RELEASE_TAG") or os.path.exists("/content"))


def _force_full_chromium() -> None:
    # Avoid chromium_headless_shell crashes on Colab/Linux (TargetClosedError).
    os.environ.setdefault("PLAYWRIGHT_CHROMIUM_USE_HEADLESS_SHELL", "0")


def _chromium_binary_present() -> bool:
    _force_full_chromium()
    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            return Path(p.chromium.executable_path).exists()
    except Exception:
        return False


def _can_launch() -> bool:
    _force_full_chromium()
    try:
        from playwright.sync_api import sync_playwright
        from ._browser import launch_chromium

        with sync_playwright() as p:
            browser = launch_chromium(p)
            browser.close()
        return True
    except Exception as e:
        progress.log(f"Chromium launch check failed: {e}")
        return False


def _run_playwright_install(with_deps: bool = False) -> None:
    cmd = [sys.executable, "-m", "playwright", "install"]
    if with_deps:
        cmd.append("--with-deps")
    cmd.append("chromium")
    progress.log("Installing Chromium" + (" + system deps" if with_deps else "") + "…")
    subprocess.run(cmd, check=True)


def ensure_chromium() -> None:
    """
    Download Chromium for Playwright if missing / broken.

    Users only need: pip install divflowpsx
    """
    global _ready
    if _ready:
        return
    with _lock:
        if _ready:
            return

        _force_full_chromium()
        in_colab = _in_colab()
        linux = sys.platform.startswith("linux")

        with progress.stage("Preparing browser"):
            if _chromium_binary_present() and _can_launch():
                _ready = True
                return

            # Colab/Linux: install OS libs first to prevent TargetClosedError
            if in_colab or linux:
                try:
                    _run_playwright_install(with_deps=True)
                except Exception:
                    _run_playwright_install(with_deps=False)
            else:
                _run_playwright_install(with_deps=False)

            if not _can_launch():
                _run_playwright_install(with_deps=True)

            if not _can_launch():
                raise RuntimeError(
                    "Could not launch Chromium for PSX scrape. "
                    "In Colab try: !playwright install --with-deps chromium "
                    "then Runtime → Restart session."
                )

        _ready = True
