#!/usr/bin/env python3
"""
NCCPL Risk Indicators Scraper
Fetches VaR, Haircut, 26Week Avg from www.nccpl.com.pk/market-information
Output: data/risk/nccpl_risk_metrics.csv
"""
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
import csv
import os
import time
from datetime import datetime

URL = "https://www.nccpl.com.pk/market-information"
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "risk")
OUTPUT_CSV = os.path.join(DATA_DIR, "nccpl_risk_metrics.csv")


def clean_symbol(symbol):
    """Extract base symbol from NCCPL format (e.g., BAHL-CAPRN1 -> BAHL)"""
    if not symbol:
        return ""
    # Remove suffixes like -CAPRN1, -CMAYN1, etc.
    parts = symbol.split('-')
    return parts[0] if parts else symbol


def scrape_nccpl_risk():
    """Scrape NCCPL VAR Margins table"""
    metrics = []
    
    with sync_playwright() as p:
        # Launch with more realistic browser settings
        browser = p.chromium.launch(
            headless=True,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox'
            ]
        )
        
        context = browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )
        page = context.new_page()
        
        # Hide webdriver flag
        page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            })
        """)
        
        print("[NCCPL] Opening market-information page...")
        try:
            page.goto(URL, timeout=90000)
            
            # Wait for Cloudflare to complete (longer wait)
            print("[NCCPL] Waiting for page to load (Cloudflare check)...")
            for i in range(6):
                time.sleep(5)
                title = page.title()
                if "Cloudflare" not in title and "Just a moment" not in title:
                    print(f"[NCCPL] Page loaded: {title}")
                    break
                print(f"[NCCPL] Still waiting ({i+1}/6)...")
            else:
                print("[NCCPL] Warning: Cloudflare may still be blocking")
            
            time.sleep(3)
            
            # Click VAR Margins tab
            print("[NCCPL] Looking for VAR Margins tab...")
            try:
                # Try multiple selectors
                var_tab = None
                selectors = [
                    "a[role='tab']:has-text('VAR Margins')",
                    "a:has-text('VAR Margins')",
                    "[role='tab']:has-text('VAR')",
                    ".nav-link:has-text('VAR')"
                ]
                
                for selector in selectors:
                    try:
                        var_tab = page.locator(selector).first
                        if var_tab.is_visible(timeout=3000):
                            print(f"[NCCPL] Found tab with selector: {selector}")
                            break
                    except:
                        continue
                
                if not var_tab:
                    print("[NCCPL] Could not find VAR Margins tab, trying to proceed anyway...")
                else:
                    var_tab.click()
                    print("[NCCPL] Clicked VAR Margins tab")
                    time.sleep(5)
            except Exception as e:
                print(f"[NCCPL] Error clicking tab: {e}")
            
            # Wait for table to load
            print("[NCCPL] Waiting for table...")
            page.wait_for_selector("table tbody tr", timeout=30000)
            time.sleep(2)
            
            # Try to increase rows per page if pagination exists
            try:
                select = page.query_selector("select[name*='length']")
                if select:
                    page.select_option(select, "100")
                    time.sleep(2)
            except:
                pass
            
            # Parse all table rows
            rows = page.query_selector_all("table tbody tr")
            print(f"[NCCPL] Found {len(rows)} rows")
            
            for row in rows:
                cols = row.query_selector_all("td")
                if len(cols) < 5:
                    continue
                
                try:
                    # Column structure: Date, Symbol, Var Value, Hair Cut, 26Week Avg, ...
                    date_text = cols[0].inner_text().strip()
                    symbol_full = cols[1].inner_text().strip()
                    var_value = float(cols[2].inner_text().strip() or 0)
                    haircut = float(cols[3].inner_text().strip() or 0)
                    week_26_avg = float(cols[4].inner_text().strip() or 0)
                    
                    # Try to get additional columns if they exist
                    acc_qty = 0
                    half_hour_rate = 0
                    trade_halt = ""
                    
                    if len(cols) > 5:
                        try:
                            acc_qty = float(cols[5].inner_text().strip().replace(",", "") or 0)
                        except:
                            pass
                    
                    if len(cols) > 6:
                        try:
                            half_hour_rate = float(cols[6].inner_text().strip() or 0)
                        except:
                            pass
                    
                    if len(cols) > 7:
                        trade_halt = cols[7].inner_text().strip()
                    
                    # Clean symbol
                    symbol = clean_symbol(symbol_full)
                    
                    if not symbol:
                        continue
                    
                    metrics.append({
                        "symbol": symbol,
                        "symbol_full": symbol_full,
                        "var_value": var_value,
                        "haircut": haircut,
                        "week_26_avg": week_26_avg,
                        "free_float": acc_qty,
                        "half_hour_avg_rate": half_hour_rate,
                        "trade_halt": trade_halt,
                        "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    })
                except Exception as e:
                    print(f"[NCCPL] Error parsing row: {e}")
                    continue
            
        except PlaywrightTimeout as e:
            print(f"[NCCPL] Timeout error: {e}")
        except Exception as e:
            print(f"[NCCPL] Error: {e}")
        finally:
            context.close()
            browser.close()
    
    if not metrics:
        print("[NCCPL] No data scraped - table may not have loaded")
        return []
    
    # Group by base symbol and take the max VaR/Haircut for each
    symbol_map = {}
    for m in metrics:
        sym = m["symbol"]
        if sym not in symbol_map:
            symbol_map[sym] = m
        else:
            # Keep the max VaR and Haircut
            if m["var_value"] > symbol_map[sym]["var_value"]:
                symbol_map[sym]["var_value"] = m["var_value"]
            if m["haircut"] > symbol_map[sym]["haircut"]:
                symbol_map[sym]["haircut"] = m["haircut"]
    
    aggregated = list(symbol_map.values())
    
    # Save to CSV
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "symbol", "symbol_full", "var_value", "haircut", "week_26_avg", "free_float",
            "half_hour_avg_rate", "trade_halt", "last_updated"
        ])
        writer.writeheader()
        writer.writerows(aggregated)
    
    print(f"[NCCPL] Saved {len(aggregated)} unique symbols to {OUTPUT_CSV}")
    return aggregated


if __name__ == "__main__":
    try:
        result = scrape_nccpl_risk()
        if result:
            print(f"[NCCPL] Success: {len(result)} symbols scraped")
        else:
            print("[NCCPL] Warning: No data was scraped")
            exit(1)
    except Exception as e:
        print(f"[NCCPL] Fatal error: {e}")
        exit(1)
