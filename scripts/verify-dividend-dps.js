#!/usr/bin/env node
/**
 * Cross-check Dividend_per_share in psx_dividend_calendar.csv against
 * official PSX payout announcements (dps.psx.com.pk) in psx_payouts.csv.
 *
 * Usage: node scripts/verify-dividend-dps.js
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parseDpsFromPsxAnnouncement, parsePaymentMonthNum } from '../backend/psxDividendParse.js';
import { loadCsv } from './csv-utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data', 'dividends');

function main() {
  const cal = loadCsv(join(DATA, 'psx_dividend_calendar.csv'), readFileSync, existsSync);
  const pay = loadCsv(join(DATA, 'psx_payouts.csv'), readFileSync, existsSync);

  const payByKey = new Map();
  for (const r of pay) {
    const sym = (r.Company || '').trim();
    const y = parseInt(r.Year || 0, 10);
    const m = parsePaymentMonthNum(r.Payment_month);
    if (!sym || !y || !m) continue;
    const ann = r.Dividend_announcement || '';
    const parsed = parseDpsFromPsxAnnouncement(ann);
    const k = `${sym}|${y}|${m}`;
    if (!payByKey.has(k)) payByKey.set(k, []);
    payByKey.get(k).push({ sym, y, m, ann, parsed });
  }

  const mismatches = [];
  let badMonths = 0;

  for (const r of cal) {
    const sym = (r.Company || '').trim();
    const y = parseInt(r.Year || 0, 10);
    const pmRaw = r.Payment_month;
    const pm = parsePaymentMonthNum(pmRaw);
    if (String(pmRaw).match(/^\d{4}-\d{2}/)) badMonths += 1;

    const calDps = parseFloat(r.Dividend_per_share || 0);
    if (!sym || !calDps) continue;

    const key = pm && y ? `${sym}|${y}|${pm}` : null;
    const psxList = key ? payByKey.get(key) : null;

    if (psxList?.length) {
      const matched = psxList.find((psx) => {
        if (psx.parsed.dps <= 0) return false;
        const diff = Math.abs(calDps - psx.parsed.dps);
        const rel = diff / Math.max(calDps, psx.parsed.dps);
        return rel <= 0.15;
      });
      if (!matched) {
        const psx = psxList[0];
        mismatches.push({
          sym,
          year: y,
          month: pm,
          calendarDps: calDps,
          psxDps: psx.parsed.dps,
          par: psx.parsed.parValue,
          announcement: psx.ann.slice(0, 60),
        });
      }
    }
  }

  console.log('=== DividendFlow DPS audit ===\n');
  console.log('Calendar rows:', cal.length);
  console.log('PSX payout rows:', pay.length);
  console.log('Calendar rows with date-like Payment_month (should be 1-12):', badMonths);
  console.log('DPS mismatches vs PSX announcement (>15% diff):', mismatches.length);
  console.log('');

  if (mismatches.length) {
    console.log('Sample mismatches (calendar | PSX-derived | announcement):');
    mismatches.slice(0, 20).forEach((x) => {
      console.log(
        `  ${x.sym} ${x.year} m${x.month}: cal Rs ${x.calendarDps} vs PSX Rs ${x.psxDps} (par ${x.par}) — ${x.announcement}`
      );
    });
    if (mismatches.length > 20) console.log(`  ... and ${mismatches.length - 20} more`);
  }

  console.log('\nConclusion: calendar file (psxterminal scrape) often disagrees with PSX notices.');
  console.log('App should use PSX announcement parsing as primary source (see backend getEnrichedDividends).');
}

main();
