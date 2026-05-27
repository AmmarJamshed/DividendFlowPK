#!/usr/bin/env node
/**
 * Main scraper entry - runs scrape, merges with fallback, pushes to GitHub, emails results
 * Schedule: 4pm PKT daily (11:00 UTC) - after market close at 3:30pm
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { scrapePsxTerminal, buildReportingCycles } from './scrape-psx.js';
import { pushToGitHub } from './update-github.js';
import { sendScraperEmail } from './send-email.js';
import { loadCsv as loadQuotedCsv } from './csv-utils.js';

const require = createRequire(import.meta.url);
const { parsePaymentMonthNum, pickDividendPerShare } = require('../backend/psxDividendParse.js');

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');

function loadFallbackCsv(path) {
  return loadQuotedCsv(path, readFileSync, existsSync);
}

function detectChanges(before, after) {
  const key = (d) => `${d.Company || d.company}-${d.Year || d.year}-${d.Payment_month || d.payment_month}`;
  const beforeMap = new Map(before.map(d => [key(d), d]));
  const afterMap = new Map(after.map(d => [key(d), d]));

  const priceChanges = [];
  const dividendChanges = [];
  const newCompanies = [...new Set(after.map(d => d.Company || d.company))].filter(c => !before.some(b => (b.Company || b.company) === c));

  for (const [k, a] of afterMap) {
    const b = beforeMap.get(k);
    const company = a.Company || a.company;
    const oldPrice = parseFloat(b?.Price || b?.price || 0);
    const newPrice = parseFloat(a.Price || a.price || 0);
    if (oldPrice > 0 && newPrice > 0 && Math.abs(oldPrice - newPrice) / oldPrice > 0.001) {
      priceChanges.push({ company, old: oldPrice.toFixed(2), new: newPrice.toFixed(2) });
    }
    const oldDiv = parseFloat(b?.Dividend_per_share || b?.dividend_per_share || 0);
    const newDiv = parseFloat(a.Dividend_per_share || a.dividend_per_share || 0);
    const oldMonth = b?.Payment_month || b?.payment_month;
    const newMonth = a.Payment_month || a.payment_month;
    if (b && (oldDiv !== newDiv || String(oldMonth) !== String(newMonth))) {
      let detail = '';
      if (oldDiv !== newDiv) detail += `Dividend Rs ${oldDiv} → Rs ${newDiv}`;
      if (String(oldMonth) !== String(newMonth)) detail += (detail ? '; ' : '') + `Payment month ${oldMonth} → ${newMonth}`;
      dividendChanges.push({ company, detail });
    }
  }

  const summary = [
    priceChanges.length ? `${priceChanges.length} price change(s)` : null,
    dividendChanges.length ? `${dividendChanges.length} dividend change(s)` : null,
    newCompanies.length ? `${newCompanies.length} new compan(ies)` : null,
  ].filter(Boolean).join(', ') || 'No changes';

  return { priceChanges, dividendChanges, newCompanies, summary };
}

async function main() {
  console.log('[Scraper] Starting (4pm PKT / 11:00 UTC)...');
  const fallbackDiv = loadFallbackCsv(join(DATA, 'dividends', 'psx_dividend_calendar.csv'));
  const fallbackCyc = loadFallbackCsv(join(DATA, 'financials', 'psx_quarter_cycles.csv'));

  let scraped = await scrapePsxTerminal();
  const key = (d) => `${d.Company || d.company}-${d.Year || d.year}-${d.Payment_month || d.payment_month}`;
  const divMap = new Map();
  fallbackDiv.forEach(d => {
    const r = { Company: d.Company || d.company, Sector: d.Sector || d.sector, Dividend_per_share: d.Dividend_per_share || d.dividend_per_share, Payment_month: d.Payment_month || d.payment_month, Dividend_yield: d.Dividend_yield || d.dividend_yield, Price: d.Price || d.price, Year: d.Year || d.year };
    if (r.Company) divMap.set(key(r), r);
  });
  scraped.forEach(d => divMap.set(key(d), { ...divMap.get(key(d)), ...d }));
  let dividends = Array.from(divMap.values()).filter(d => d.Company).sort((a, b) => (a.Company || '').localeCompare(b.Company || '') || (a.Year || 0) - (b.Year || 0));

  // Prefer official PSX payout notice for DPS + payment month (1–12), not psxterminal "Last Div"
  const payoutsPath = join(DATA, 'dividends', 'psx_payouts.csv');
  if (existsSync(payoutsPath)) {
    const payouts = loadFallbackCsv(payoutsPath);
    const latestPayoutByCompany = new Map();
    for (const p of payouts) {
      const c = (p.Company || p.company || '').trim();
      if (!c) continue;
      const y = parseInt(p.Year || p.year || 0, 10);
      const m = parsePaymentMonthNum(p.Payment_month || p.payment_month) || 0;
      const prev = latestPayoutByCompany.get(c);
      if (!prev || y > prev.y || (y === prev.y && m > prev.m)) {
        latestPayoutByCompany.set(c, { y, m, p });
      }
    }
    dividends = dividends.map((d) => {
      const c = (d.Company || d.company || '').trim();
      const pm = parsePaymentMonthNum(d.Payment_month || d.payment_month);
      let row = { ...d, Payment_month: pm || d.Payment_month };
      const lp = latestPayoutByCompany.get(c);
      if (!lp) return row;
      const picked = pickDividendPerShare({
        announcement: lp.p.Dividend_announcement || lp.p.dividend_announcement || '',
        calendarDps: row.Dividend_per_share || row.dividend_per_share,
      });
      const payoutMonth = parsePaymentMonthNum(lp.p.Payment_month || lp.p.payment_month);
      return {
        ...row,
        Payment_month: payoutMonth || row.Payment_month,
        Dividend_per_share: picked.dps > 0 ? picked.dps : row.Dividend_per_share,
        Year: lp.y || row.Year || row.year,
      };
    });
    console.log('[Scraper] Applied', latestPayoutByCompany.size, 'PSX payout notices (DPS + month)');
  } else {
    dividends = dividends.map((d) => ({
      ...d,
      Payment_month: parsePaymentMonthNum(d.Payment_month || d.payment_month) || d.Payment_month,
    }));
  }

  const reportingCycles = buildReportingCycles(dividends);
  const byCyc = new Map(reportingCycles.map(r => [r.Company, r]));
  fallbackCyc.forEach(r => { const c = r.Company || r.company; if (!byCyc.has(c)) byCyc.set(c, r); });
  const cycles = Array.from(byCyc.values());

  const changes = detectChanges(fallbackDiv, dividends);
  console.log('[Scraper] Dividends:', dividends.length, 'Reporting cycles:', cycles.length, '|', changes.summary);

  const today = new Date().toISOString().slice(0, 10);
  const byCompany = new Map();
  dividends.forEach(d => {
    const c = d.Company || d.company;
    const p = parseFloat(d.Price || d.price || 0);
    if (c && p > 0) byCompany.set(c, p);
  });
  const { writeFileSync, mkdirSync, readFileSync } = await import('fs');
  const { toDividendCsv, toCyclesCsv } = await import('./update-github.js');
  mkdirSync(join(DATA, 'dividends'), { recursive: true });
  mkdirSync(join(DATA, 'financials'), { recursive: true });
  mkdirSync(join(DATA, 'prices'), { recursive: true });
  writeFileSync(join(DATA, 'dividends', 'psx_dividend_calendar.csv'), toDividendCsv(dividends));
  writeFileSync(join(DATA, 'financials', 'psx_quarter_cycles.csv'), toCyclesCsv(cycles));
  // Merge today's prices into daily_prices history (keep last 14 days for run-news comparison)
  const dailyPath = join(DATA, 'prices', 'daily_prices.csv');
  let existing = [];
  if (existsSync(dailyPath)) {
    const raw = readFileSync(dailyPath, 'utf-8').split('\n').filter(Boolean);
    const hdrs = raw[0]?.split(',').map(h => h.trim()) || [];
    const dateIdx = hdrs.findIndex(h => /date/i.test(h));
    const companyIdx = hdrs.findIndex(h => /company/i.test(h));
    const priceIdx = hdrs.findIndex(h => /price/i.test(h));
    if (dateIdx >= 0 && companyIdx >= 0 && priceIdx >= 0) {
      const cutoff = new Date(today);
      cutoff.setDate(cutoff.getDate() - 14);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      for (let i = 1; i < raw.length; i++) {
        const vals = raw[i].split(',').map(v => v.replace(/^"|"$/g, '').trim());
        const rowDate = vals[dateIdx];
        if (rowDate && rowDate !== today && rowDate >= cutoffStr) {
          existing.push({ Company: vals[companyIdx], Date: rowDate, Price: vals[priceIdx] });
        }
      }
    }
  }
  const todayRows = [...byCompany].map(([c, p]) => ({ Company: c, Date: today, Price: p }));
  const merged = [...existing, ...todayRows].sort((a, b) => a.Date.localeCompare(b.Date) || (a.Company || '').localeCompare(b.Company || ''));
  writeFileSync(dailyPath, ['Company,Date,Price', ...merged.map(r => `${r.Company},${r.Date},${r.Price}`)].join('\n'));

  let pushed = false;
  if (process.env.GITHUB_TOKEN) {
    await pushToGitHub(dividends, cycles);
    pushed = true;
  } else {
    console.log('[Scraper] No GITHUB_TOKEN - skipping push.');
  }

  if (process.env.SCRAPER_EMAIL_TO) {
    await sendScraperEmail({ success: true, changes });
  }
  console.log('[Scraper] Done');
}

main().catch(async err => {
  console.error('[Scraper] Error:', err);
  if (process.env.SCRAPER_EMAIL_TO) {
    await sendScraperEmail({ success: false, error: err.message }).catch(e => console.error('[Email]', e));
  }
  process.exit(1);
});
