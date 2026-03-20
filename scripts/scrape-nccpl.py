#!/usr/bin/env python3
"""
NCCPL Risk Indicators Scraper
Fetches VaR, Haircut, 26Week Avg from www.nccpl.com.pk/market-information
Output: data/risk/nccpl_risk_metrics.csv
"""
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
from undetected_playwright import stealth_sync
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


def process_downloaded_csv(csv_path):
    """Process the downloaded NCCPL CSV"""
    if not os.path.exists(csv_path):
        print(f"[NCCPL] Error: Downloaded CSV not found at {csv_path}")
        return []
    
    # Read the export
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    
    print(f"[NCCPL] Loaded {len(rows)} rows from export")
    
    # Group by base symbol
    symbol_map = {}
    
    for row in rows:
        symbol_full = row.get('Symbol', '').strip()
        base_symbol = clean_symbol(symbol_full)
        
        if not base_symbol:
            continue
        
        try:
            var_value = float(row.get('Var Value', 0) or 0)
            haircut = float(row.get('Hair Cut', 0) or 0)
            week_26_avg = float(row.get('26Week Avg', 0) or 0)
            free_float_str = str(row.get('Free Float', 0) or 0).replace(',', '').strip()
            free_float = float(free_float_str) if free_float_str and free_float_str != '-' else 0
            half_hour_rate = float(row.get('Half Hour Avg Rate', 0) or 0)
            
            # Skip futures/options (KSE30-MAR, OGTI-APR, etc.)
            if base_symbol in ['KSE30', 'OGTI', 'BKTI']:
                continue
            
            # Skip if it's a derivative with 0 haircut
            if haircut == 0:
                continue
            
            if base_symbol not in symbol_map:
                symbol_map[base_symbol] = {
                    'symbol': base_symbol,
                    'symbol_full': symbol_full,
                    'var_value': var_value,
                    'haircut': haircut,
                    'week_26_avg': week_26_avg,
                    'free_float': free_float,
                    'half_hour_avg_rate': half_hour_rate,
                }
            else:
                # Keep the max VaR and Haircut
                if var_value > symbol_map[base_symbol]['var_value']:
                    symbol_map[base_symbol]['var_value'] = var_value
                if haircut > symbol_map[base_symbol]['haircut']:
                    symbol_map[base_symbol]['haircut'] = haircut
                if week_26_avg > symbol_map[base_symbol]['week_26_avg']:
                    symbol_map[base_symbol]['week_26_avg'] = week_26_avg
                if free_float > symbol_map[base_symbol]['free_float']:
                    symbol_map[base_symbol]['free_float'] = free_float
                if half_hour_rate > symbol_map[base_symbol]['half_hour_avg_rate']:
                    symbol_map[base_symbol]['half_hour_avg_rate'] = half_hour_rate
        
        except Exception as e:
            print(f"[NCCPL] Error processing row {symbol_full}: {e}")
            continue
    
    # Convert to list and sort by symbol
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
        for item in aggregated:
            writer.writerow({
                'symbol': item['symbol'],
                'symbol_full': item['symbol_full'],
                'var_value': item['var_value'],
                'haircut': item['haircut'],
                'week_26_avg': item['week_26_avg'],
                'free_float': item['free_float'],
                'half_hour_avg_rate': item['half_hour_avg_rate'],
                'trade_halt': item['trade_halt'],
                'last_updated': item['last_updated'],
            })
    
    print(f"[NCCPL] Processed {len(aggregated)} unique symbols")
    print(f"[NCCPL] Saved to {OUTPUT_CSV}")
    
    # Clean up temp file
    try:
        os.remove(csv_path)
        print(f"[NCCPL] Cleaned up temp file")
    except:
        pass
    
    return aggregated


def scrape_nccpl_risk():
    """Scrape NCCPL VAR Margins by downloading CSV export"""
    
    with sync_playwright() as p:
        # Launch browser
        browser = p.chromium.launch(headless=True)
        
        # Set up download handling
        context = browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            accept_downloads=True,
            locale='en-US',
            timezone_id='Asia/Karachi'
        )
        page = context.new_page()
        
        # Apply stealth to bypass Cloudflare
        stealth_sync(page)
        
        print("[NCCPL] Opening market-information page...")
        try:
            page.goto(URL, wait_until='domcontentloaded', timeout=90000)
            
            # Wait for Cloudflare to complete with better detection
            print("[NCCPL] Waiting for page to load (Cloudflare check)...")
            for i in range(10):
                time.sleep(3)
                title = page.title()
                content = page.content()
                
                # Check if we're past Cloudflare
                if "Cloudflare" not in title and "Just a moment" not in title and "Market Information" in title:
                    print(f"[NCCPL] Page loaded successfully: {title}")
                    break
                    
                # Check if Cloudflare challenge is present
                if "Cloudflare" in content or "cf-browser-verification" in content:
                    print(f"[NCCPL] Cloudflare detected, waiting... ({i+1}/10)")
                else:
                    print(f"[NCCPL] Page loading... ({i+1}/10)")
            else:
                print("[NCCPL] Warning: May still be blocked, attempting to proceed...")
            
            # Additional wait for JavaScript to settle
            page.wait_for_load_state('networkidle', timeout=30000)
            time.sleep(3)
            
            # Click VAR Margins tab with retry
            print("[NCCPL] Looking for VAR Margins tab...")
            tab_clicked = False
            for attempt in range(3):
                try:
                    var_tab = page.locator("a[role='tab']:has-text('VAR Margins')").first
                    var_tab.wait_for(state='visible', timeout=10000)
                    var_tab.scroll_into_view_if_needed()
                    time.sleep(1)
                    var_tab.click()
                    print("[NCCPL] Clicked VAR Margins tab")
                    tab_clicked = True
                    break
                except Exception as e:
                    print(f"[NCCPL] Attempt {attempt+1} to click tab failed: {e}")
                    time.sleep(2)
            
            if not tab_clicked:
                raise Exception("Could not click VAR Margins tab after 3 attempts")
            
            time.sleep(5)
            
            # Wait for table to appear
            print("[NCCPL] Waiting for table to load...")
            page.wait_for_selector("table tbody tr", timeout=30000)
            print("[NCCPL] Table loaded")
            time.sleep(2)
            
            # Click Export button and wait for download
            print("[NCCPL] Clicking Export button...")
            with page.expect_download(timeout=30000) as download_info:
                export_btn = page.locator("button:has-text('Export')").first
                export_btn.scroll_into_view_if_needed()
                time.sleep(1)
                export_btn.click()
            
            download = download_info.value
            download_path = os.path.join(DATA_DIR, "var-margins-temp.csv")
            os.makedirs(DATA_DIR, exist_ok=True)
            download.save_as(download_path)
            print(f"[NCCPL] Downloaded CSV to {download_path}")
            
        except Exception as e:
            print(f"[NCCPL] Error during scraping: {e}")
            
            # Take screenshot for debugging
            try:
                screenshot_path = os.path.join(DATA_DIR, "nccpl-error-screenshot.png")
                page.screenshot(path=screenshot_path)
                print(f"[NCCPL] Saved error screenshot to {screenshot_path}")
            except:
                pass
            
            context.close()
            browser.close()
            return []
        finally:
            context.close()
            browser.close()
    
    # Process the downloaded CSV
    print("[NCCPL] Processing downloaded CSV...")
    return process_downloaded_csv(download_path)


def process_downloaded_csv(csv_path):
    """Process the downloaded NCCPL CSV"""
    if not os.path.exists(csv_path):
        print(f"[NCCPL] Error: Downloaded CSV not found at {csv_path}")
        return []
    
    # Read the export
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    
    print(f"[NCCPL] Loaded {len(rows)} rows from export")
    
    # Group by base symbol
    symbol_map = {}
    
    for row in rows:
        symbol_full = row.get('Symbol', '').strip()
        base_symbol = clean_symbol(symbol_full)
        
        if not base_symbol:
            continue
        
        try:
            var_value = float(row.get('Var Value', 0) or 0)
            haircut = float(row.get('Hair Cut', 0) or 0)
            week_26_avg = float(row.get('26Week Avg', 0) or 0)
            free_float_str = str(row.get('Free Float', 0) or 0).replace(',', '').strip()
            free_float = float(free_float_str) if free_float_str and free_float_str != '-' else 0
            half_hour_rate = float(row.get('Half Hour Avg Rate', 0) or 0)
            
            # Skip futures/options (KSE30-MAR, OGTI-APR, etc.)
            if base_symbol in ['KSE30', 'OGTI', 'BKTI']:
                continue
            
            # Skip if it's a derivative with 0 haircut
            if haircut == 0:
                continue
            
            if base_symbol not in symbol_map:
                symbol_map[base_symbol] = {
                    'symbol': base_symbol,
                    'symbol_full': symbol_full,
                    'var_value': var_value,
                    'haircut': haircut,
                    'week_26_avg': week_26_avg,
                    'free_float': free_float,
                    'half_hour_avg_rate': half_hour_rate,
                }
            else:
                # Keep the max VaR and Haircut
                if var_value > symbol_map[base_symbol]['var_value']:
                    symbol_map[base_symbol]['var_value'] = var_value
                if haircut > symbol_map[base_symbol]['haircut']:
                    symbol_map[base_symbol]['haircut'] = haircut
                if week_26_avg > symbol_map[base_symbol]['week_26_avg']:
                    symbol_map[base_symbol]['week_26_avg'] = week_26_avg
                if free_float > symbol_map[base_symbol]['free_float']:
                    symbol_map[base_symbol]['free_float'] = free_float
                if half_hour_rate > symbol_map[base_symbol]['half_hour_avg_rate']:
                    symbol_map[base_symbol]['half_hour_avg_rate'] = half_hour_rate
        
        except Exception as e:
            print(f"[NCCPL] Error processing row {symbol_full}: {e}")
            continue
    
    # Convert to list and sort by symbol
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
        for item in aggregated:
            writer.writerow({
                'symbol': item['symbol'],
                'symbol_full': item['symbol_full'],
                'var_value': item['var_value'],
                'haircut': item['haircut'],
                'week_26_avg': item['week_26_avg'],
                'free_float': item['free_float'],
                'half_hour_avg_rate': item['half_hour_avg_rate'],
                'trade_halt': item['trade_halt'],
                'last_updated': item['last_updated'],
            })
    
    print(f"[NCCPL] Processed {len(aggregated)} unique symbols")
    print(f"[NCCPL] Saved to {OUTPUT_CSV}")
    
    # Clean up temp file
    try:
        os.remove(csv_path)
        print(f"[NCCPL] Cleaned up temp file")
    except:
        pass
    
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
