#!/usr/bin/env python3
"""
NCCPL Risk Scraper using Browserless.io
Bypasses Cloudflare using remote browser service
Requires: BROWSERLESS_TOKEN environment variable

Optional env:
  BROWSERLESS_WS_HOST, BROWSERLESS_UNBLOCK_HOSTS — region override
  BROWSERLESS_UNBLOCK_TIMEOUT — /unblock server wait seconds (default 300)
  NCCPL_UNBLOCK_ATTEMPTS_PER_HOST, NCCPL_UNBLOCK_RETRY_PAUSE
  NCCPL_MIN_SCRAPED_ROWS — minimum parsed rows to accept (default 15)
  NCCPL_CF_WAIT_SECONDS — max wait for Cloudflare to clear per CDP session (default 240)
"""
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
from bs4 import BeautifulSoup
import csv
import os
import time
import json
import base64
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime

URL = "https://www.nccpl.com.pk/market-information"
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "risk")
OUTPUT_CSV = os.path.join(DATA_DIR, "nccpl_risk_metrics.csv")

# Get Browserless token from environment
BROWSERLESS_TOKEN = os.getenv('BROWSERLESS_TOKEN')
if not BROWSERLESS_TOKEN:
    print("[NCCPL] ERROR: BROWSERLESS_TOKEN environment variable not set")
    print("[NCCPL] Get a free token from https://www.browserless.io/")
    exit(1)

# REST host (HTTPS) for Unblock API — same hostname as WS regions.
# https://docs.browserless.io/rest-apis/unblock
# Try primary (BROWSERLESS_WS_HOST) then fallbacks; Cloudflare/unblock often succeeds on a different region.
_DEFAULT_UNBLOCK_HOSTS = (
    "production-sfo.browserless.io",
    "production-ams.browserless.io",
    "production-lon.browserless.io",
)


def _unblock_hosts_ordered():
    primary = (os.getenv("BROWSERLESS_WS_HOST") or "").strip()
    extra = os.getenv("BROWSERLESS_UNBLOCK_HOSTS", "")
    hosts = []
    for part in [primary, *extra.split(","), *_DEFAULT_UNBLOCK_HOSTS]:
        h = (part or "").strip()
        if h and h not in hosts:
            hosts.append(h)
    return hosts


def _normalize_ws_endpoint(ws: str) -> str:
    if not ws:
        return ws
    if "token=" not in ws:
        sep = "&" if "?" in ws else "?"
        ws = f"{ws}{sep}token={urllib.parse.quote(BROWSERLESS_TOKEN)}"
    return ws


def _browserless_unblock_json(ws_host: str) -> dict:
    """
    POST /unblock — request CDP endpoint and optionally rendered HTML.
    Some plans reject content+ws together; fall back to ws-only on HTTP 400.
    """
    timeout_q = (os.getenv("BROWSERLESS_UNBLOCK_TIMEOUT", "300") or "300").strip()
    q = urllib.parse.urlencode({
        "token": BROWSERLESS_TOKEN,
        "timeout": timeout_q,
    })
    api_url = f"https://{ws_host}/unblock?{q}"
    last_err = None
    for include_content in (True, False):
        payload_obj = {
            "url": URL,
            "browserWSEndpoint": True,
            "cookies": True,
            "screenshot": False,
            "ttl": 300000,
        }
        if include_content:
            payload_obj["content"] = True
        payload = json.dumps(payload_obj).encode("utf-8")
        req = urllib.request.Request(
            api_url,
            data=payload,
            headers={"Content-Type": "application/json", "User-Agent": "DividendFlowPK-nccpl-scraper"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=480) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            err_body = e.read().decode(errors="replace")[:800]
            last_err = e
            if e.code == 400 and include_content:
                print(f"[NCCPL] /unblock content=true not accepted; retrying ws-only: {err_body[:200]}")
                continue
            print(f"[NCCPL] Browserless /unblock HTTP {e.code}: {err_body}")
            raise
    raise last_err or RuntimeError("unblock failed")


def clean_symbol(symbol):
    """Extract base symbol from NCCPL format"""
    if not symbol:
        return ""
    parts = symbol.split('-')
    return parts[0] if parts else symbol


def _parse_var_margin_rows_from_html(html: str):
    """Parse VaR / haircut table rows from rendered HTML (Browserless /unblock content)."""
    metrics = []
    soup = BeautifulSoup(html, "html.parser")
    for table in soup.find_all("table"):
        tbody = table.find("tbody")
        rows = tbody.find_all("tr") if tbody else table.find_all("tr")
        for tr in rows:
            tds = tr.find_all("td")
            if len(tds) < 5:
                continue
            try:
                symbol_full = tds[1].get_text(strip=True)
                var_value = float((tds[2].get_text(strip=True) or "0").replace(",", "") or 0)
                haircut = float((tds[3].get_text(strip=True) or "0").replace(",", "") or 0)
                week_26_avg = float((tds[4].get_text(strip=True) or "0").replace(",", "") or 0)
                free_float = 0
                half_hour_rate = 0
                if len(tds) > 7:
                    try:
                        ff = tds[7].get_text(strip=True).replace(",", "")
                        free_float = float(ff) if ff and ff != "-" else 0
                    except (ValueError, TypeError):
                        pass
                if len(tds) > 6:
                    try:
                        half_hour_rate = float((tds[6].get_text(strip=True) or "0").replace(",", "") or 0)
                    except (ValueError, TypeError):
                        pass
                base_symbol = clean_symbol(symbol_full)
                if not base_symbol or base_symbol in ("KSE30", "OGTI", "BKTI"):
                    continue
                if haircut == 0:
                    continue
                metrics.append({
                    "symbol": base_symbol,
                    "symbol_full": symbol_full,
                    "var_value": var_value,
                    "haircut": haircut,
                    "week_26_avg": week_26_avg,
                    "free_float": free_float,
                    "half_hour_avg_rate": half_hour_rate,
                })
            except (ValueError, TypeError, IndexError) as e:
                print(f"[NCCPL] HTML row parse skip: {e}")
                continue
    return metrics


def _wait_cloudflare_then_ready(page, max_wait_s: float = None):
    """Wait for Cloudflare interstitial to clear; one reload retry."""
    if max_wait_s is None:
        max_wait_s = float(os.getenv("NCCPL_CF_WAIT_SECONDS", "240"))
    max_ms = int(max_wait_s * 1000)
    for round_idx in range(2):
        try:
            page.wait_for_function(
                """() => {
                    const t = (document.title || '').toLowerCase();
                    if (t.includes('cloudflare') || t.includes('attention required')) return false;
                    if (t.includes('just a moment')) return false;
                    return true;
                }""",
                timeout=max_ms if round_idx == 0 else max(60_000, max_ms // 2),
            )
            return True
        except PlaywrightTimeoutError:
            pass
        try:
            tl = (page.title() or "").lower()
            if "cloudflare" not in tl and "attention required" not in tl and "just a moment" not in tl:
                return True
        except Exception:
            pass
        if round_idx == 0:
            print("[NCCPL] Cloudflare wait timed out; reloading once…")
            try:
                page.reload(wait_until="domcontentloaded", timeout=90000)
            except Exception as e:
                print(f"[NCCPL] Reload failed: {e}")
    return False


def _collect_unblock_cdp_attempts():
    """
    Try Browserless /unblock per region (with per-host retries).
    Returns list of (label, ws_url, html_or_none). HTML may include the VaR table
    without Playwright; ws_url may be empty if only HTML was returned (rare).
    """
    out = []
    per_host_attempts = max(1, int(os.getenv("NCCPL_UNBLOCK_ATTEMPTS_PER_HOST", "2")))
    pause_s = float(os.getenv("NCCPL_UNBLOCK_RETRY_PAUSE", "25"))
    for ws_host in _unblock_hosts_ordered():
        for attempt in range(1, per_host_attempts + 1):
            try:
                print(
                    f"[NCCPL] Unblock via Browserless (host={ws_host}, attempt {attempt}/{per_host_attempts})..."
                )
                body = _browserless_unblock_json(ws_host)
                ws_raw = body.get("browserWSEndpoint")
                html = body.get("content") or body.get("data") or body.get("html")
                if isinstance(html, str) and "<" in html and len(html.strip()) > 200:
                    html = html.strip()
                else:
                    html = None
                ws = _normalize_ws_endpoint(ws_raw) if ws_raw else ""
                if not ws and not html:
                    raise RuntimeError(
                        f"No browserWSEndpoint or HTML in response keys={list(body.keys())[:12]}"
                    )
                out.append((f"unblock({ws_host})", ws, html))
                break
            except Exception as e:
                print(f"[NCCPL] Unblock failed on {ws_host}: {e}")
                if attempt < per_host_attempts:
                    time.sleep(pause_s)
    return out


def _cdp_attempt_urls_ordered():
    """
    Order matters: Browserless /unblock must run before plain stealth CDP from GitHub
    runners, or NCCPL stays behind Cloudflare. Collect every successful per-region
    unblock, then append stealth fallbacks.
    """
    tok = urllib.parse.quote(BROWSERLESS_TOKEN)
    hosts = _unblock_hosts_ordered()
    stealth_pairs = []
    for h in hosts:
        stealth_pairs.append(
            (f"chromium-stealth({h})", f"wss://{h}/chromium/stealth?token={tok}", None)
        )
        stealth_pairs.append(
            (f"stealth({h})", f"wss://{h}/stealth?token={tok}", None)
        )

    if os.getenv("GITHUB_ACTIONS") == "true":
        print("[NCCPL] GitHub Actions: /unblock per region first, then stealth CDP fallback.")
    else:
        print("[NCCPL] /unblock per region first, then stealth CDP fallback.")

    attempts = list(_collect_unblock_cdp_attempts())
    attempts.extend(stealth_pairs)

    seen = set()
    out = []
    for label, url, html_frag in attempts:
        key = (url or "", (html_frag or "")[:160])
        if key in seen:
            continue
        seen.add(key)
        out.append((label, url, html_frag))
    return out


def _collect_table_rows_cdp(p, ws_url, label):
    """Connect over CDP and return raw metric rows (list of dicts). Raises on hard failures."""
    if not ws_url:
        raise ValueError("missing WebSocket URL for CDP")
    print(f"[NCCPL] CDP session ({label})…")
    metrics = []
    browser = None
    try:
        browser = p.chromium.connect_over_cdp(ws_url, timeout=180000)
        ctx = browser.contexts[0] if browser.contexts else browser.new_context()
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        if URL not in (page.url or ""):
            print("[NCCPL] Opening market-information page...")
            page.goto(URL, wait_until='domcontentloaded', timeout=90000)

        print("[NCCPL] Waiting for page to settle...")
        try:
            page.wait_for_load_state('networkidle', timeout=25000)
        except Exception:
            pass
        time.sleep(2)

        if not _wait_cloudflare_then_ready(page):
            title = page.title()
            print(f"[NCCPL] Page title after CF wait: {title}")
            tl = (title or "").lower()
            if "cloudflare" in tl or "attention required" in tl:
                raise RuntimeError("Blocked by Cloudflare interstitial (try next CDP session)")

        title = page.title()
        print(f"[NCCPL] Page loaded: {title}")
        tl = (title or "").lower()
        if "cloudflare" in tl or "attention required" in tl:
            raise RuntimeError("Blocked by Cloudflare interstitial (try next CDP session)")

        print("[NCCPL] Clicking VAR Margins tab...")
        var_selectors = [
            "a[role='tab']:has-text('VAR Margins')",
            "button[role='tab']:has-text('VAR Margins')",
            "[role='tab']:has-text('VAR Margins')",
            "text=VAR Margins",
        ]
        clicked = False
        for sel in var_selectors:
            loc = page.locator(sel).first
            try:
                loc.wait_for(state="visible", timeout=15000)
                loc.click(timeout=10000)
                clicked = True
                break
            except Exception:
                continue
        if not clicked:
            raise RuntimeError("VAR Margins tab not found")
        print("[NCCPL] Clicked VAR Margins tab")
        time.sleep(4)

        print("[NCCPL] Waiting for table to load...")
        page.wait_for_selector("table tbody tr", timeout=120000)
        print("[NCCPL] Table loaded")
        time.sleep(2)

        print("[NCCPL] Extracting table data...")
        rows = page.query_selector_all("table tbody tr")
        print(f"[NCCPL] Found {len(rows)} rows")

        for row in rows:
            cols = row.query_selector_all("td")
            if len(cols) < 5:
                continue

            try:
                symbol_full = cols[1].inner_text().strip()
                var_value = float(cols[2].inner_text().strip() or 0)
                haircut = float(cols[3].inner_text().strip() or 0)
                week_26_avg = float(cols[4].inner_text().strip() or 0)

                free_float = 0
                half_hour_rate = 0

                if len(cols) > 7:
                    try:
                        free_float_str = cols[7].inner_text().strip().replace(',', '')
                        free_float = float(free_float_str) if free_float_str and free_float_str != '-' else 0
                    except Exception:
                        pass

                if len(cols) > 6:
                    try:
                        half_hour_rate = float(cols[6].inner_text().strip() or 0)
                    except Exception:
                        pass

                base_symbol = clean_symbol(symbol_full)
                if not base_symbol:
                    continue

                if base_symbol in ['KSE30', 'OGTI', 'BKTI']:
                    continue

                if haircut == 0:
                    continue

                metrics.append({
                    'symbol': base_symbol,
                    'symbol_full': symbol_full,
                    'var_value': var_value,
                    'haircut': haircut,
                    'week_26_avg': week_26_avg,
                    'free_float': free_float,
                    'half_hour_avg_rate': half_hour_rate,
                })

            except Exception as e:
                print(f"[NCCPL] Error parsing row: {e}")
                continue

        return metrics
    finally:
        if browser:
            try:
                browser.close()
            except Exception:
                pass


def scrape_nccpl_risk():
    """Scrape NCCPL VAR Margins using Browserless.io"""
    min_rows = max(1, int(os.getenv("NCCPL_MIN_SCRAPED_ROWS", "15")))
    metrics = []
    with sync_playwright() as p:
        for label, ws_url, html_frag in _cdp_attempt_urls_ordered():
            metrics = []
            if html_frag:
                metrics = _parse_var_margin_rows_from_html(html_frag)
                print(f"[NCCPL] HTML parse ({label}): {len(metrics)} candidate rows")
            if len(metrics) < min_rows and ws_url:
                try:
                    cdp_rows = _collect_table_rows_cdp(p, ws_url, label)
                    if len(cdp_rows) > len(metrics):
                        metrics = cdp_rows
                except Exception as e:
                    print(f"[NCCPL] {label} CDP failed: {e}")
            if len(metrics) >= min_rows:
                print(f"[NCCPL] ✓ {label}: {len(metrics)} candidate rows (≥{min_rows})")
                break
            print(f"[NCCPL] {label}: only {len(metrics)} usable rows (need ≥{min_rows}); trying next…")

    if not metrics:
        print("[NCCPL] No data extracted")
        return []
    
    # Aggregate by base symbol
    print(f"[NCCPL] Aggregating {len(metrics)} rows...")
    symbol_map = {}
    
    for m in metrics:
        sym = m['symbol']
        if sym not in symbol_map:
            symbol_map[sym] = m
        else:
            # Keep max VaR and Haircut
            if m['var_value'] > symbol_map[sym]['var_value']:
                symbol_map[sym]['var_value'] = m['var_value']
            if m['haircut'] > symbol_map[sym]['haircut']:
                symbol_map[sym]['haircut'] = m['haircut']
            if m['week_26_avg'] > symbol_map[sym]['week_26_avg']:
                symbol_map[sym]['week_26_avg'] = m['week_26_avg']
            if m['free_float'] > symbol_map[sym]['free_float']:
                symbol_map[sym]['free_float'] = m['free_float']
            if m['half_hour_avg_rate'] > symbol_map[sym]['half_hour_avg_rate']:
                symbol_map[sym]['half_hour_avg_rate'] = m['half_hour_avg_rate']
    
    aggregated = sorted(symbol_map.values(), key=lambda x: x['symbol'])
    
    # Add timestamp
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    for item in aggregated:
        item['last_updated'] = now
        item['trade_halt'] = 'N'
    
    # Save to CSV
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(OUTPUT_CSV, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=[
            'symbol', 'symbol_full', 'var_value', 'haircut', 'week_26_avg',
            'free_float', 'half_hour_avg_rate', 'trade_halt', 'last_updated'
        ])
        writer.writeheader()
        writer.writerows(aggregated)
    
    print(f"[NCCPL] Saved {len(aggregated)} unique symbols to {OUTPUT_CSV}")
    
    # Show sample
    print("\n=== Sample (first 10) ===")
    for item in aggregated[:10]:
        print(f"{item['symbol']:10} VaR: {item['var_value']:5.1f}  Haircut: {item['haircut']:5.1f}")
    
    return aggregated


def push_to_github():
    """Upload updated CSV via GitHub Contents API (same pattern as psx.py — reliable on Render cron)."""
    token = os.getenv("GITHUB_TOKEN")
    repo = os.getenv("GITHUB_REPO", "AmmarJamshed/DividendFlowPK")
    if not token:
        print("[NCCPL] No GITHUB_TOKEN, skipping push")
        return

    remote_path = "data/risk/nccpl_risk_metrics.csv"
    msg = f"Update NCCPL risk data - {datetime.now().strftime('%Y-%m-%d %H:%M')}"

    gh_headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "DividendFlowPK-nccpl-scraper",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    def get_sha(path):
        try:
            req = urllib.request.Request(
                f"https://api.github.com/repos/{repo}/contents/{path}",
                headers=gh_headers,
            )
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode())["sha"]
        except Exception:
            return None

    try:
        with open(OUTPUT_CSV, "r", encoding="utf-8") as f:
            body = f.read()
        payload = {
            "message": msg,
            "content": base64.b64encode(body.encode("utf-8")).decode("ascii"),
        }
        sha = get_sha(remote_path)
        if sha:
            payload["sha"] = sha
        req = urllib.request.Request(
            f"https://api.github.com/repos/{repo}/contents/{remote_path}",
            data=json.dumps(payload).encode("utf-8"),
            headers={**gh_headers, "Content-Type": "application/json"},
            method="PUT",
        )
        urllib.request.urlopen(req, timeout=90)
        print("[NCCPL] ✓ Pushed to GitHub (Contents API)")
    except Exception as e:
        print(f"[NCCPL] GitHub API push failed: {e}")


if __name__ == "__main__":
    try:
        result = scrape_nccpl_risk()
        if result:
            print(f"\n[NCCPL] ✓ Success: {len(result)} symbols scraped")
            
            # Push from Render cron or GitHub Actions (Contents API; avoid git push on ephemeral workers)
            if os.getenv("RENDER") or os.getenv("GITHUB_ACTIONS"):
                push_to_github()
        else:
            print("\n[NCCPL] ✗ Warning: No data was scraped")
            exit(1)
    except Exception as e:
        print(f"\n[NCCPL] ✗ Fatal error: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
