#!/usr/bin/env node
/**
 * Rebuild data/dividends/psx_dividend_calendar.csv from official PSX payouts + latest prices.
 * Run after psx.py updates psx_payouts.csv: node scripts/rebuild-calendar-from-psx.js
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parseDpsFromPsxAnnouncement, parsePaymentMonthNum } from '../backend/psxDividendParse.js';
import { loadCsv } from './csv-utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
const PAYOUTS = join(DATA, 'dividends', 'psx_payouts.csv');
const PRICES = join(DATA, 'prices', 'psx_full_dataset.csv');
const OUT = join(DATA, 'dividends', 'psx_dividend_calendar.csv');

function main() {
  if (!existsSync(PAYOUTS)) {
    console.error('Missing', PAYOUTS);
    process.exit(1);
  }

  const payouts = loadCsv(PAYOUTS, readFileSync, existsSync);
  const priceBySym = new Map();
  if (existsSync(PRICES)) {
    for (const r of loadCsv(PRICES, readFileSync, existsSync)) {
      const sym = (r.symbol || r.Symbol || '').trim();
      const close = parseFloat(String(r.close || r.Close || '').replace(/,/g, '')) || 0;
      if (sym && close > 0) priceBySym.set(sym, close);
    }
  }

  const rows = [];
  for (const p of payouts) {
    const company = (p.Company || '').trim();
    const ann = p.Dividend_announcement || '';
    const paymentMonth = parsePaymentMonthNum(p.Payment_month);
    const year = parseInt(p.Year || 0, 10);
    if (!company || !paymentMonth || !year) continue;

    const { dps, parValue } = parseDpsFromPsxAnnouncement(ann);
    if (dps <= 0) continue;

    const price = priceBySym.get(company) || 0;
    const yieldPct =
      price > 0 ? Math.round((dps / price) * 10000) / 100 : '';

    rows.push({
      Company: company,
      Sector: (p.Sector || '').trim() || 'Other',
      Dividend_per_share: dps,
      Payment_month: paymentMonth,
      Dividend_yield: yieldPct,
      Price: price || '',
      Year: year,
      Par_value: parValue,
    });
  }

  rows.sort(
    (a, b) =>
      a.Company.localeCompare(b.Company) ||
      a.Year - b.Year ||
      a.Payment_month - b.Payment_month
  );

  const header = 'Company,Sector,Dividend_per_share,Payment_month,Dividend_yield,Price,Year';
  const body = rows
    .map((r) =>
      [
        r.Company,
        r.Sector,
        r.Dividend_per_share,
        r.Payment_month,
        r.Dividend_yield,
        r.Price,
        r.Year,
      ].join(',')
    )
    .join('\n');

  writeFileSync(OUT, `${header}\n${body}\n`, 'utf-8');
  console.log(`Wrote ${rows.length} rows to ${OUT}`);
}

main();
