#!/usr/bin/env node
/**
 * Main scraper entry - runs scrape, merges with fallback, pushes to GitHub
 * Run from cron: GITHUB_TOKEN=xxx GITHUB_REPO=AmmarJamshed/DividendFlowPK node run-all.js
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { scrapePsxTerminal, buildReportingCycles } from './scrape-psx.js';
import { pushToGitHub } from './update-github.js';

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

async function main() {
  console.log('[Scraper] Starting...');
  const fallbackDiv = loadFallbackCsv(join(DATA, 'dividends', 'psx_dividend_calendar.csv'));
  const fallbackCyc = loadFallbackCsv(join(DATA, 'financials', 'psx_quarter_cycles.csv'));

  let dividends = await scrapePsxTerminal();
  const byCo = new Map();
  fallbackDiv.forEach(d => {
    const c = (d.Company || d.company || '').trim();
    if (c) byCo.set(c, { Company: c, Sector: d.Sector || d.sector, Dividend_per_share: d.Dividend_per_share || d.dividend_per_share, Payment_month: d.Payment_month || d.payment_month, Dividend_yield: d.Dividend_yield || d.dividend_yield, Price: d.Price || d.price, Year: d.Year || d.year });
  });
  dividends.forEach(d => byCo.set(d.Company, { ...byCo.get(d.Company), ...d }));
  dividends = Array.from(byCo.values()).filter(d => d.Company);

  const reportingCycles = buildReportingCycles(dividends);
  const byCyc = new Map(reportingCycles.map(r => [r.Company, r]));
  fallbackCyc.forEach(r => { const c = r.Company || r.company; if (!byCyc.has(c)) byCyc.set(c, r); });
  const cycles = Array.from(byCyc.values());

  console.log('[Scraper] Dividends:', dividends.length, 'Reporting cycles:', cycles.length);

  if (process.env.GITHUB_TOKEN) {
    await pushToGitHub(dividends, cycles);
  } else {
    console.log('[Scraper] No GITHUB_TOKEN - skipping push. Writing locally.');
    const { writeFileSync } = await import('fs');
    const { toDividendCsv, toCyclesCsv } = await import('./update-github.js');
    const { mkdirSync } = await import('fs');
    mkdirSync(join(DATA, 'dividends'), { recursive: true });
    mkdirSync(join(DATA, 'financials'), { recursive: true });
    writeFileSync(join(DATA, 'dividends', 'psx_dividend_calendar.csv'), toDividendCsv(dividends));
    writeFileSync(join(DATA, 'financials', 'psx_quarter_cycles.csv'), toCyclesCsv(cycles));
  }
  console.log('[Scraper] Done');
}

main().catch(err => {
  console.error('[Scraper] Error:', err);
  process.exit(1);
});
