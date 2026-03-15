#!/usr/bin/env python3
"""
Daily PSX price scraper - fetches from dps.psx.com.pk/historical
Payouts scraper - fetches current dividend dates from dps.psx.com.pk/payouts
Outputs: data/prices/psx_full_dataset.csv, daily_prices.csv, price_changes.csv
        data/dividends/psx_payouts.csv (current payout dates from PSX)
"""
from playwright.sync_api import sync_playwright
import pandas as pd
import os
import time
import csv
import json
import base64
import urllib.request
import re
from datetime import datetime, timedelta

URL = "https://dps.psx.com.pk/historical"
PAYOUTS_URL = "https://dps.psx.com.pk/payouts"
DATA_DIR = os.path.join(os.path.dirname(__file__), "data", "prices")
DIVIDEND_DIR = os.path.join(os.path.dirname(__file__), "data", "dividends")
DIVIDEND_CSV = os.path.join(DIVIDEND_DIR, "psx_dividend_calendar.csv")
PAYOUTS_CSV = os.path.join(DIVIDEND_DIR, "psx_payouts.csv")


def scrape_psx_payouts():
    """Scrape current dividend payout dates from dps.psx.com.pk/payouts.
    Book closure date format: DD/MM/YYYY - DD/MM/YYYY. Payment typically ~1 month after.
    We use the end date month + 1 as Payment_month (e.g. book 30/03 -> payment April = 4).
    """
    payouts = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(PAYOUTS_URL, timeout=60000)
        page.wait_for_load_state("networkidle")
        time.sleep(4)

        rows = page.query_selector_all("table tbody tr")
        for row in rows:
            cols = row.query_selector_all("td")
            if len(cols) < 6:
                continue
            symbol = cols[0].inner_text().strip()
            company = cols[1].inner_text().strip()
            book_closure = cols[5].inner_text().strip()
            # Parse "DD/MM/YYYY - DD/MM/YYYY" or "DD/MM/YYYY" - use end date
            matches = re.findall(r"(\d{1,2})/(\d{1,2})/(\d{4})", book_closure)
            if matches:
                d, m, y = int(matches[-1][0]), int(matches[-1][1]), int(matches[-1][2])
                # Payment typically 1 month after book closure
                pay_month = m + 1 if m < 12 else 1
                payouts.append({
                    "Company": symbol,
                    "CompanyName": company,
                    "BookClosureEnd": f"{y}-{m:02d}-{d:02d}",
                    "Payment_month": pay_month,
                })
        browser.close()

    os.makedirs(DIVIDEND_DIR, exist_ok=True)
    if payouts:
        df = pd.DataFrame(payouts)
        df.to_csv(PAYOUTS_CSV, index=False)
        print(f"Saved {len(payouts)} payouts to {PAYOUTS_CSV}")
    return payouts


def load_tracked_companies():
    """Companies we track from dividend calendar"""
    if not os.path.exists(DIVIDEND_CSV):
        return None
    companies = set()
    with open(DIVIDEND_CSV, "r", encoding="utf-8") as f:
        r = csv.DictReader(f)
        for row in r:
            c = (row.get("Company") or row.get("company") or "").strip()
            if c:
                companies.add(c)
    return companies if companies else None


def scrape_psx():
    dataset = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        print("Opening PSX historical page...")
        page.goto(URL, timeout=60000)

        page.wait_for_selector("#historicalTable", timeout=30000)
        page.select_option("select[name='historicalTable_length']", "100")
        time.sleep(3)

        while True:
            rows = page.query_selector_all("#historicalTable tbody tr")
            for row in rows:
                cols = row.query_selector_all("td")
                if len(cols) < 9:
                    continue
                dataset.append({
                    "date": datetime.today().strftime("%Y-%m-%d"),
                    "symbol": cols[0].inner_text().strip(),
                    "ldcp": cols[1].inner_text().strip(),
                    "open": cols[2].inner_text().strip(),
                    "high": cols[3].inner_text().strip(),
                    "low": cols[4].inner_text().strip(),
                    "close": cols[5].inner_text().strip(),
                    "change": cols[6].inner_text().strip(),
                    "change_pct": cols[7].inner_text().strip(),
                    "volume": cols[8].inner_text().strip(),
                })

            next_button = page.query_selector("a.paginate_button.next:not(.disabled)")
            if next_button:
                next_button.click()
                time.sleep(2)
            else:
                break

        browser.close()

    df = pd.DataFrame(dataset)
    os.makedirs(DATA_DIR, exist_ok=True)
    full_path = os.path.join(DATA_DIR, "psx_full_dataset.csv")
    df.to_csv(full_path, index=False)
    print(f"Saved {len(df)} rows to {full_path}")

    # Filter to tracked companies and build daily_prices + price_changes
    tracked = load_tracked_companies()
    if tracked:
        df_tracked = df[df["symbol"].isin(tracked)].copy()
    else:
        df_tracked = df

    def clean_num(s):
        if pd.isna(s):
            return 0.0
        s = str(s).replace(",", "").replace("%", "").strip()
        try:
            return float(s)
        except ValueError:
            return 0.0

    today = datetime.today().strftime("%Y-%m-%d")
    yesterday = (datetime.today() - timedelta(days=1)).strftime("%Y-%m-%d")
    daily_prices = []
    price_changes = []

    for _, r in df_tracked.iterrows():
        sym = r["symbol"]
        close = clean_num(r["close"])
        prev = clean_num(r["ldcp"])
        chg = clean_num(r["change"])
        chg_pct = clean_num(r["change_pct"])
        if close > 0:
            daily_prices.append({"Company": sym, "Date": today, "Price": close})
        if prev > 0:
            daily_prices.append({"Company": sym, "Date": yesterday, "Price": prev})
        if prev > 0 and close > 0:
            price_changes.append({
                "Company": sym,
                "Price": round(close, 2),
                "PreviousPrice": round(prev, 2),
                "Change": round(chg, 2),
                "ChangePct": round(chg_pct, 2),
                "Date": today,
            })

    # Merge into existing daily_prices history (keep last 14 days)
    daily_path = os.path.join(DATA_DIR, "daily_prices.csv")
    existing = []
    if os.path.exists(daily_path):
        with open(daily_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                rd = row.get("Date") or row.get("date")
                if rd and rd != today:
                    cutoff = (datetime.today() - timedelta(days=14)).strftime("%Y-%m-%d")
                    if rd >= cutoff:
                        existing.append(row)
    today_rows = [{"Company": d["Company"], "Date": d["Date"], "Price": d["Price"]} for d in daily_prices]
    by_key = {f"{r['Company']}|{r['Date']}": r for r in existing}
    for r in today_rows:
        by_key[f"{r['Company']}|{r['Date']}"] = r
    merged = sorted(by_key.values(), key=lambda x: (x["Date"], x["Company"]))
    with open(daily_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["Company", "Date", "Price"])
        w.writeheader()
        w.writerows(merged)

    # Write price_changes
    changes_path = os.path.join(DATA_DIR, "price_changes.csv")
    price_changes.sort(key=lambda x: abs(x["ChangePct"]), reverse=True)
    with open(changes_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["Company", "Price", "PreviousPrice", "Change", "ChangePct", "Date"])
        w.writeheader()
        w.writerows(price_changes)

    print(f"Updated daily_prices ({len(daily_prices)} companies), price_changes ({len(price_changes)} with change)")

    token = os.environ.get("GITHUB_TOKEN")
    repo = os.environ.get("GITHUB_REPO", "AmmarJamshed/DividendFlowPK")
    if token:
        push_to_github(token, repo)

    return len(df)


def push_to_github(token, repo):
    """Push price CSVs to GitHub via API"""
    try:
        ts = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S")
        msg = f"PSX price scraped: {ts}"

        def get_sha(path):
            try:
                req = urllib.request.Request(
                    f"https://api.github.com/repos/{repo}/contents/{path}",
                    headers={"Authorization": f"Bearer {token}"},
                )
                with urllib.request.urlopen(req, timeout=10) as r:
                    return json.loads(r.read())["sha"]
            except Exception:
                return None

        def update_file(path, content):
            payload = {"message": msg, "content": base64.b64encode(content.encode("utf-8")).decode("utf-8")}
            sha = get_sha(path)
            if sha:
                payload["sha"] = sha
            req = urllib.request.Request(
                f"https://api.github.com/repos/{repo}/contents/{path}",
                data=json.dumps(payload).encode(),
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                method="PUT",
            )
            urllib.request.urlopen(req, timeout=30)

        for path in ["data/prices/daily_prices.csv", "data/prices/price_changes.csv", "data/prices/psx_full_dataset.csv", "data/dividends/psx_payouts.csv"]:
            fp = os.path.join(os.path.dirname(__file__), path)
            if os.path.exists(fp):
                with open(fp, "r", encoding="utf-8") as f:
                    update_file(path, f.read())
        print("Pushed to GitHub:", msg)
    except Exception as e:
        print("GitHub push failed:", e)


if __name__ == "__main__":
    from send_email import send_email
    try:
        payouts_count = len(scrape_psx_payouts())
        prices_count = scrape_psx()
        summary = f"{payouts_count} payouts, {prices_count} prices scraped"
        send_email(success=True, summary=summary)
    except Exception as e:
        print(f"[Error] {e}")
        send_email(success=False, error=str(e))
        raise