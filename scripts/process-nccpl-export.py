#!/usr/bin/env python3
"""
Process NCCPL VAR Margins export CSV
Cleans symbols and aggregates by base symbol (max VaR/Haircut)
"""
import csv
import os
from datetime import datetime

INPUT_CSV = r"C:\Users\User\Downloads\var-margins.csv"
OUTPUT_CSV = os.path.join(os.path.dirname(__file__), "..", "data", "risk", "nccpl_risk_metrics.csv")


def clean_symbol(symbol):
    """Extract base symbol from NCCPL format"""
    if not symbol:
        return ""
    # Remove suffixes like -CAPRN1, -CMAR, -CMAY, -CAPR, -APR, -MAR, -MAY, -APRB, -MARB, -MAYB
    parts = symbol.split('-')
    return parts[0] if parts else symbol


def process_nccpl_export():
    """Process NCCPL export and aggregate by base symbol"""
    
    if not os.path.exists(INPUT_CSV):
        print(f"Error: {INPUT_CSV} not found")
        return
    
    # Read the export
    with open(INPUT_CSV, 'r', encoding='utf-8') as f:
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
            free_float = float(str(row.get('Free Float', 0) or 0).replace(',', ''))
            half_hour_rate = float(row.get('Half Hour Avg Rate', 0) or 0)
            acc_qty = row.get('Acc Qty%', '')
            
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
                    'acc_qty': acc_qty,
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
    os.makedirs(os.path.dirname(OUTPUT_CSV), exist_ok=True)
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
    
    # Show sample
    print("\n=== Sample (first 10) ===")
    for item in aggregated[:10]:
        print(f"{item['symbol']:10} VaR: {item['var_value']:5.1f}  Haircut: {item['haircut']:5.1f}")


if __name__ == "__main__":
    process_nccpl_export()
