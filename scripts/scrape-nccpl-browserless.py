#!/usr/bin/env python3
"""
NCCPL Risk Scraper using Browserless.io
Bypasses Cloudflare using remote browser service
Requires: BROWSERLESS_TOKEN environment variable
"""
from playwright.sync_api import sync_playwright
import csv
import os
import time
import subprocess
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

BROWSERLESS_URL = f'wss://production-sfo.browserless.io?token={BROWSERLESS_TOKEN}'


def clean_symbol(symbol):
    """Extract base symbol from NCCPL format"""
    if not symbol:
        return ""
    parts = symbol.split('-')
    return parts[0] if parts else symbol


def scrape_nccpl_risk():
    """Scrape NCCPL VAR Margins using Browserless.io"""
    
    print(f"[NCCPL] Connecting to Browserless.io...")
    
    with sync_playwright() as p:
        try:
            # Connect to remote browser (bypasses Cloudflare)
            browser = p.chromium.connect(BROWSERLESS_URL)
            page = browser.new_page()
            
            print("[NCCPL] Opening market-information page...")
            page.goto(URL, wait_until='domcontentloaded', timeout=90000)
            
            # Wait for page to load (Browserless handles Cloudflare)
            print("[NCCPL] Waiting for page to load...")
            page.wait_for_load_state('networkidle', timeout=60000)
            time.sleep(3)
            
            title = page.title()
            print(f"[NCCPL] Page loaded: {title}")
            
            # Click VAR Margins tab
            print("[NCCPL] Clicking VAR Margins tab...")
            var_tab = page.locator("a[role='tab']:has-text('VAR Margins')").first
            var_tab.wait_for(state='visible', timeout=30000)
            var_tab.click()
            print("[NCCPL] Clicked VAR Margins tab")
            time.sleep(5)
            
            # Wait for table
            print("[NCCPL] Waiting for table to load...")
            page.wait_for_selector("table tbody tr", timeout=30000)
            print("[NCCPL] Table loaded")
            time.sleep(2)
            
            # Get table data directly (instead of downloading)
            print("[NCCPL] Extracting table data...")
            rows = page.query_selector_all("table tbody tr")
            print(f"[NCCPL] Found {len(rows)} rows")
            
            metrics = []
            for row in rows:
                cols = row.query_selector_all("td")
                if len(cols) < 5:
                    continue
                
                try:
                    symbol_full = cols[1].inner_text().strip()
                    var_value = float(cols[2].inner_text().strip() or 0)
                    haircut = float(cols[3].inner_text().strip() or 0)
                    week_26_avg = float(cols[4].inner_text().strip() or 0)
                    
                    # Get additional columns
                    free_float = 0
                    half_hour_rate = 0
                    
                    if len(cols) > 7:
                        try:
                            free_float_str = cols[7].inner_text().strip().replace(',', '')
                            free_float = float(free_float_str) if free_float_str and free_float_str != '-' else 0
                        except:
                            pass
                    
                    if len(cols) > 6:
                        try:
                            half_hour_rate = float(cols[6].inner_text().strip() or 0)
                        except:
                            pass
                    
                    base_symbol = clean_symbol(symbol_full)
                    if not base_symbol:
                        continue
                    
                    # Skip futures/options
                    if base_symbol in ['KSE30', 'OGTI', 'BKTI']:
                        continue
                    
                    # Skip derivatives with 0 haircut
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
            
            browser.close()
            
        except Exception as e:
            print(f"[NCCPL] Error during scraping: {e}")
            try:
                browser.close()
            except:
                pass
            return []
    
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
    """Commit and push updated CSV to GitHub"""
    github_token = os.getenv('GITHUB_TOKEN')
    github_repo = os.getenv('GITHUB_REPO', 'AmmarJamshed/DividendFlowPK')
    
    if not github_token:
        print("[NCCPL] No GITHUB_TOKEN, skipping push")
        return
    
    try:
        print("[NCCPL] Committing changes to GitHub...")
        
        # Configure git
        subprocess.run(['git', 'config', 'user.name', 'NCCPL Scraper Bot'], check=True)
        subprocess.run(['git', 'config', 'user.email', 'bot@dividendflow.pk'], check=True)
        
        # Add the CSV file
        subprocess.run(['git', 'add', 'data/risk/nccpl_risk_metrics.csv'], check=True)
        
        # Check if there are changes
        result = subprocess.run(['git', 'diff', '--cached', '--quiet'], capture_output=True)
        if result.returncode == 0:
            print("[NCCPL] No changes to commit")
            return
        
        # Commit
        commit_msg = f"Update NCCPL risk data - {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        subprocess.run(['git', 'commit', '-m', commit_msg], check=True)
        
        # Push with token
        repo_url = f"https://{github_token}@github.com/{github_repo}.git"
        subprocess.run(['git', 'push', repo_url, 'main'], check=True)
        
        print("[NCCPL] ✓ Pushed to GitHub")
        
    except subprocess.CalledProcessError as e:
        print(f"[NCCPL] Git error: {e}")
    except Exception as e:
        print(f"[NCCPL] Push error: {e}")


if __name__ == "__main__":
    try:
        result = scrape_nccpl_risk()
        if result:
            print(f"\n[NCCPL] ✓ Success: {len(result)} symbols scraped")
            
            # Push to GitHub if running on Render
            if os.getenv('RENDER'):
                push_to_github()
        else:
            print("\n[NCCPL] ✗ Warning: No data was scraped")
            exit(1)
    except Exception as e:
        print(f"\n[NCCPL] ✗ Fatal error: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
