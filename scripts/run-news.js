#!/usr/bin/env node
/**
 * Daily news + price scraper + Groq commentary + push to GitHub
 * Schedule: 12:00 UTC (5pm PKT) - after market close
 */
import { scrapePsxNews, getGroqPriceCommentary } from './scrape-news.js';
import { scrapeCurrentPrices, computePriceChanges, loadPreviousPrices } from './scrape-prices.js';
import { pushNewsToGitHub, toDividendCsv } from './update-github.js';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');

function loadDividendCsv(path) {
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

function csvEscape(val) {
  const s = String(val ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

const toCsv = (rows, headers) => {
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map(h => csvEscape(r[h])).join(','));
  }
  return lines.join('\n');
};

async function main() {
  console.log('[News] Starting...');
  const { news, commentary } = await scrapePsxNews();
  console.log('[News] Matched', news.length, 'articles for', [...new Set(news.map(n => n.Company))].length, 'companies');
  console.log('[News] AI commentary for', commentary.length, 'companies');

  mkdirSync(join(DATA, 'news'), { recursive: true });
  mkdirSync(join(DATA, 'prices'), { recursive: true });

  writeFileSync(
    join(DATA, 'news', 'daily_news.csv'),
    toCsv(news, ['Company', 'Headline', 'Date', 'Source', 'Url'])
  );
  writeFileSync(
    join(DATA, 'news', 'ai_commentary.csv'),
    toCsv(commentary, ['Company', 'Commentary', 'Date'])
  );

  const today = new Date().toISOString().slice(0, 10);
  const newsByCompany = (news || []).reduce((acc, n) => {
    const c = n.Company || n.company;
    if (!acc[c]) acc[c] = [];
    acc[c].push(n.Headline || n.headline);
    return acc;
  }, {});

  let currentPrices = await scrapeCurrentPrices();
  const previousPrices = loadPreviousPrices(today);
  let priceChanges = computePriceChanges([...currentPrices], previousPrices);

  // Fallback: if our scrape produced no price changes, preserve from psx.py output (price_changes.csv) for AI Risk Dashboard
  const priceChangesPath = join(DATA, 'prices', 'price_changes.csv');
  if (priceChanges.length === 0 && existsSync(priceChangesPath)) {
    const existing = loadDividendCsv(priceChangesPath);
    const pcRows = existing.filter(r => (r.Company || r.company) && (r.ChangePct || r.Change));
    if (pcRows.length > 0) {
      priceChanges = pcRows.map(r => ({
        Company: r.Company || r.company,
        Price: parseFloat(r.Price) || 0,
        PreviousPrice: parseFloat(r.PreviousPrice) || 0,
        Change: parseFloat(r.Change) || 0,
        ChangePct: parseFloat(r.ChangePct) || 0,
      })).filter(x => x.Company && (x.ChangePct !== 0 || x.Change !== 0));
      console.log('[Prices] Using', priceChanges.length, 'price changes from existing file (psx.py)');
    }
  }
  console.log('[Prices] Scraped', currentPrices.size, 'prices,', priceChanges.length, 'with day-over-day change (vs yesterday)');

  // Merge today's prices into history (keep last 14 days for yesterday comparison)
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
  const todayRows = [...currentPrices].map(([Company, Price]) => ({ Company, Date: today, Price }));
  const merged = [...existing, ...todayRows].sort((a, b) => a.Date.localeCompare(b.Date) || (a.Company || '').localeCompare(b.Company || ''));
  // Only overwrite daily_prices if we have new data; otherwise preserve psx.py output for AI Risk Dashboard
  if (todayRows.length > 0 || priceChanges.length > 0) {
    writeFileSync(dailyPath, toCsv(merged, ['Company', 'Date', 'Price']));
  } else {
    console.log('[Prices] Keeping existing daily_prices (no new scrape data)');
  }

  // Refresh dividend calendar with latest prices and recalculated yields
  const divPath = join(DATA, 'dividends', 'psx_dividend_calendar.csv');
  if (existsSync(divPath) && currentPrices.size > 0) {
    const dividends = loadDividendCsv(divPath);
    const updated = dividends.map(d => {
      const company = (d.Company || d.company || '').trim();
      const price = currentPrices.get(company);
      if (!price || price <= 0) return d;
      const divPerShare = parseFloat(d.Dividend_per_share || d.dividend_per_share || 0);
      const yieldVal = divPerShare > 0 ? Math.round((divPerShare / price) * 10000) / 100 : (parseFloat(d.Dividend_yield || d.dividend_yield) || 0);
      return { ...d, Price: price, Dividend_yield: yieldVal, dividend_yield: yieldVal };
    });
    mkdirSync(join(DATA, 'dividends'), { recursive: true });
    writeFileSync(divPath, toDividendCsv(updated));
    console.log('[Prices] Updated dividend calendar with', currentPrices.size, 'prices');
  }

  const priceCommentary = [];
  const topGainers = priceChanges.filter(c => c.ChangePct > 0).slice(0, 5);
  const topDecliners = priceChanges.filter(c => c.ChangePct < 0).slice(0, 5);
  for (const c of [...topGainers, ...topDecliners]) {
    const headlines = newsByCompany[c.Company] || [];
    const comment = await getGroqPriceCommentary(
      c.Company,
      c.ChangePct > 0 ? 'gained' : 'declined',
      c.ChangePct,
      headlines
    );
    if (comment) {
      priceCommentary.push({
        Company: c.Company,
        Direction: c.ChangePct > 0 ? 'gain' : 'decline',
        ChangePct: c.ChangePct,
        Commentary: comment,
        Date: today,
      });
    }
  }
  console.log('[Prices] AI commentary for', priceCommentary.length, 'movers');

  writeFileSync(
    join(DATA, 'prices', 'price_changes.csv'),
    toCsv(priceChanges.map(c => ({ ...c, Date: today })), ['Company', 'Price', 'PreviousPrice', 'Change', 'ChangePct', 'Date'])
  );
  writeFileSync(
    join(DATA, 'news', 'price_commentary.csv'),
    toCsv(priceCommentary, ['Company', 'Direction', 'ChangePct', 'Commentary', 'Date'])
  );

  if (process.env.GITHUB_TOKEN) {
    await pushNewsToGitHub();
  } else {
    console.log('[News] No GITHUB_TOKEN - skipping push');
  }
  console.log('[News] Done');
}

main().catch(err => {
  console.error('[News] Error:', err);
  process.exit(1);
});
