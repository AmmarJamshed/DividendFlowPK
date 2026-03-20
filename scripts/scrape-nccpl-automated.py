#!/usr/bin/env python3
"""
NCCPL Risk Scraper - Automated via Cursor Browser MCP
This script uses Cursor's browser automation to bypass Cloudflare
Run this daily on Render using the browser MCP service
"""
import subprocess
import json
import os
import csv
import time
from datetime import datetime

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "risk")
OUTPUT_CSV = os.path.join(DATA_DIR, "nccpl_risk_metrics.csv")
DOWNLOAD_DIR = os.path.expanduser("~/Downloads")

def clean_symbol(symbol):
    """Extract base symbol from NCCPL format"""
    if not symbol:
        return ""
    parts = symbol.split('-')
    return parts[0] if parts else symbol

def find_latest_var_margins_csv():
    """Find the most recently downloaded var-margins CSV"""
    files = []
    for f in os.listdir(DOWNLOAD_DIR):
        if 'var-margins' in f.lower() and f.endswith('.csv'):
            full_path = os.path.join(DOWNLOAD_DIR, f)
            files.append((full_path, os.path.getmtime(full_path)))
    
    if not files:
        return None
    
    # Return most recent
    files.sort(key=lambda x: x[1], reverse=True)
    return files[0][0]

def process_csv(csv_path):
    """Process NCCPL CSV and aggregate by symbol"""
    print(f"[NCCPL] Processing {csv_path}...")
    
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    
    print(f"[NCCPL] Loaded {len(rows)} rows")
    
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
            
            # Skip futures/options
            if base_symbol in ['KSE30', 'OGTI', 'BKTI']:
                continue
            
            # Skip derivatives with 0 haircut
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
                # Keep max VaR and Haircut
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
            print(f"[NCCPL] Error processing {symbol_full}: {e}")
            continue
    
    # Convert to list and sort
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
    return len(aggregated)

if __name__ == "__main__":
    print("[NCCPL] Looking for latest var-margins CSV in Downloads...")
    csv_path = find_latest_var_margins_csv()
    
    if not csv_path:
        print("[NCCPL] ERROR: No var-margins CSV found in Downloads folder")
        print("[NCCPL] Please run the browser automation first to download the file")
        exit(1)
    
    print(f"[NCCPL] Found: {csv_path}")
    count = process_csv(csv_path)
    print(f"[NCCPL] Success! Processed {count} symbols")
