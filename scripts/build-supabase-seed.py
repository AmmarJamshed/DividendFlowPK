#!/usr/bin/env python3
"""Generate batched SQL seed files from PSX CSVs for Supabase MCP load."""
from __future__ import annotations

import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = ROOT / "supabase" / "seed_batches"
BATCH = 150


def esc(s: str | None) -> str:
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"


def num(v) -> str:
    if v is None or v == "":
        return "NULL"
    s = str(v).replace(",", "").replace("%", "").strip()
    try:
        return str(float(s))
    except ValueError:
        return "NULL"


def int_num(v) -> str:
    if v is None or v == "":
        return "NULL"
    try:
        return str(int(float(str(v).strip())))
    except ValueError:
        return "NULL"


def read_csv(rel: str) -> list[dict]:
    fp = DATA / rel.replace("/", "\\") if "\\" not in rel else Path(rel)
    fp = DATA / Path(rel)
    if not fp.exists():
        return []
    with fp.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def shariah_set() -> set[str]:
    fp = DATA / "reference" / "psx_shariah_compliant.json"
    if not fp.exists():
        return set()
    data = json.loads(fp.read_text(encoding="utf-8"))
    return {s.upper() for s in data.get("symbols", [])}


def write_batches(name: str, statements: list[str]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for i in range(0, len(statements), BATCH):
        chunk = statements[i : i + BATCH]
        body = "\n".join(chunk)
        (OUT / f"{name}_{i // BATCH:03d}.sql").write_text(body, encoding="utf-8")
    print(f"{name}: {len(statements)} statements in {(len(statements) + BATCH - 1) // BATCH} files")


def main() -> None:
    sh = shariah_set()
    calendar = read_csv("dividends/psx_dividend_calendar.csv")
    payouts = read_csv("dividends/psx_payouts.csv")
    full = read_csv("prices/psx_full_dataset.csv")

    by_sym: dict[str, dict] = {}
    for r in calendar:
        sym = (r.get("Company") or r.get("company") or "").strip().upper()
        if not sym:
            continue
        by_sym[sym] = {
            "sector": (r.get("Sector") or r.get("sector") or "").strip() or None,
            "name": None,
            "shariah": sym in sh,
        }
    for r in payouts:
        sym = (r.get("Company") or r.get("company") or "").strip().upper()
        if not sym:
            continue
        row = by_sym.get(sym, {"shariah": sym in sh})
        row["name"] = (r.get("CompanyName") or r.get("companyName") or row.get("name") or "").strip() or None
        row["sector"] = (r.get("Sector") or r.get("sector") or row.get("sector") or "").strip() or None
        row["shariah"] = sym in sh
        by_sym[sym] = row
    for r in full:
        sym = (r.get("symbol") or r.get("Symbol") or "").strip().upper()
        if sym and sym not in by_sym:
            by_sym[sym] = {"sector": None, "name": None, "shariah": sym in sh}

    sec_stmts = []
    for sym, meta in sorted(by_sym.items()):
        sec_stmts.append(
            "INSERT INTO securities (exchange_id, symbol, name, sector, shariah_compliant) "
            f"SELECT id, {esc(sym)}, {esc(meta.get('name'))}, {esc(meta.get('sector'))}, "
            f"{'true' if meta.get('shariah') else 'false'} FROM exchanges WHERE code = 'PSX' "
            "ON CONFLICT (exchange_id, symbol) DO UPDATE SET "
            "name = EXCLUDED.name, sector = EXCLUDED.sector, shariah_compliant = EXCLUDED.shariah_compliant, updated_at = now();"
        )
    write_batches("securities", sec_stmts)

    cal_stmts = []
    for r in calendar:
        sym = (r.get("Company") or r.get("company") or "").strip().upper()
        if not sym:
            continue
        cal_stmts.append(
            "INSERT INTO dividend_calendar (security_id, dividend_per_share, payment_month, dividend_yield, price, year) "
            f"SELECT s.id, {num(r.get('Dividend_per_share') or r.get('dividend_per_share'))}, "
            f"{int_num(r.get('Payment_month') or r.get('payment_month'))}, "
            f"{num(r.get('Dividend_yield') or r.get('dividend_yield'))}, "
            f"{num(r.get('Price') or r.get('price'))}, "
            f"{int_num(r.get('Year') or r.get('year')) or '2026'} "
            f"FROM securities s JOIN exchanges e ON s.exchange_id = e.id "
            f"WHERE e.code = 'PSX' AND s.symbol = {esc(sym)} "
            "ON CONFLICT (security_id, year, payment_month) DO UPDATE SET "
            "dividend_per_share = EXCLUDED.dividend_per_share, dividend_yield = EXCLUDED.dividend_yield, "
            "price = EXCLUDED.price, scraped_at = now();"
        )
    write_batches("dividend_calendar", cal_stmts)

    price_stmts = []
    for r in full:
        sym = (r.get("symbol") or r.get("Symbol") or "").strip().upper()
        dt = (r.get("date") or r.get("Date") or "")[:10]
        if not sym or not re.match(r"^\d{4}-\d{2}-\d{2}$", dt):
            continue
        price_stmts.append(
            "INSERT INTO daily_prices (security_id, trade_date, open, high, low, close, ldcp, change_amount, change_pct, volume) "
            f"SELECT s.id, {esc(dt)}, {num(r.get('open'))}, {num(r.get('high'))}, {num(r.get('low'))}, "
            f"{num(r.get('close'))}, {num(r.get('ldcp'))}, {num(r.get('change'))}, {num(r.get('change_pct'))}, "
            f"{int_num(str(r.get('volume', '0')).replace(',', ''))} "
            f"FROM securities s JOIN exchanges e ON s.exchange_id = e.id "
            f"WHERE e.code = 'PSX' AND s.symbol = {esc(sym)} "
            "ON CONFLICT (security_id, trade_date) DO UPDATE SET "
            "close = EXCLUDED.close, change_pct = EXCLUDED.change_pct, scraped_at = now();"
        )
    write_batches("daily_prices", price_stmts)

    print("Done. Output:", OUT)


if __name__ == "__main__":
    main()
