#!/usr/bin/env node
/**
 * Main scraper entry - runs scrape, merges with fallback, pushes to GitHub, emails results
 * Schedule: 4pm PKT daily (11:00 UTC) - after market close at 3:30pm
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { scrapePsxTerminal, buildReportingCycles } from './scrape-psx.js';
import { pushToGitHub } from './update-github.js';
import { sendScraperEmail } from './send-email.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');

function loadFallbackCsv(path) {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, 'utf-8').split('\n').filter(Boolean);
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.replace(/^"|"$/g, '').trim());
    const row = {};
    headers.forEach((h, i) => row[h] = vals[i]);
    return row;
  });
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
  const dividends = Array.from(divMap.values()).filter(d => d.Company).sort((a, b) => (a.Company || '').localeCompare(b.Company || '') || (a.Year || 0) - (b.Year || 0));

  const reportingCycles = buildReportingCycles(dividends);
  const byCyc = new Map(reportingCycles.map(r => [r.Company, r]));
  fallbackCyc.forEach(r => { const c = r.Company || r.company; if (!byCyc.has(c)) byCyc.set(c, r); });
  const cycles = Array.from(byCyc.values());

  const changes = detectChanges(fallbackDiv, dividends);
  console.log('[Scraper] Dividends:', dividends.length, 'Reporting cycles:', cycles.length, '|', changes.summary);

  let pushed = false;
  if (process.env.GITHUB_TOKEN) {
    await pushToGitHub(dividends, cycles);
    pushed = true;
  } else {
    console.log('[Scraper] No GITHUB_TOKEN - skipping push. Writing locally.');
    const { writeFileSync, mkdirSync } = await import('fs');
    const { toDividendCsv, toCyclesCsv } = await import('./update-github.js');
    mkdirSync(join(DATA, 'dividends'), { recursive: true });
    mkdirSync(join(DATA, 'financials'), { recursive: true });
    writeFileSync(join(DATA, 'dividends', 'psx_dividend_calendar.csv'), toDividendCsv(dividends));
    writeFileSync(join(DATA, 'financials', 'psx_quarter_cycles.csv'), toCyclesCsv(cycles));
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
