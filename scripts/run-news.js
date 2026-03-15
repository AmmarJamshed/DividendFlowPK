#!/usr/bin/env node
/**
 * Daily news + price scraper + Groq commentary + push to GitHub
 * Schedule: 12:00 UTC (5pm PKT) - after market close
 */
import { scrapePsxNews, getGroqPriceCommentary } from './scrape-news.js';
import { scrapeCurrentPrices, computePriceChanges, loadPreviousPrices } from './scrape-prices.js';
import { pushNewsToGitHub, toDividendCsv } from './update-github.js';
import { sendScraperEmail } from './send-email.js';
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

  // Use price data from psx.py (GitHub Actions) instead of scraping again
  const priceChangesPath = join(DATA, 'prices', 'price_changes.csv');
  let priceChanges = [];
  let currentPrices = new Map();
  
  if (existsSync(priceChangesPath)) {
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
      priceChanges.forEach(p => currentPrices.set(p.Company, p.Price));
      console.log('[Prices] Loaded', priceChanges.length, 'price changes from psx.py (GitHub Actions)');
    }
  }
  
  // If no price data from psx.py yet, scrape as fallback
  if (currentPrices.size === 0) {
    console.log('[Prices] No data from psx.py - scraping as fallback');
    currentPrices = await scrapeCurrentPrices();
    const previousPrices = loadPreviousPrices(today);
    priceChanges = computePriceChanges([...currentPrices], previousPrices);
  }
  
  console.log('[Prices]', currentPrices.size, 'prices,', priceChanges.length, 'with day-over-day change');

  // Skip updating daily_prices - psx.py (GitHub Actions) handles this

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

  // Skip updating price_changes.csv - psx.py (GitHub Actions) handles this
  writeFileSync(
    join(DATA, 'news', 'price_commentary.csv'),
    toCsv(priceCommentary, ['Company', 'Direction', 'ChangePct', 'Commentary', 'Date'])
  );

  if (process.env.GITHUB_TOKEN) {
    await pushNewsToGitHub();
  } else {
    console.log('[News] No GITHUB_TOKEN - skipping push');
  }
  
  if (process.env.SCRAPER_EMAIL_TO) {
    await sendScraperEmail({
      success: true,
      changes: {
        summary: `${news.length} news articles, ${priceCommentary.length} AI price commentaries, ${priceChanges.length} price movers`,
        priceChanges: [],
        dividendChanges: [],
        newCompanies: [],
      }
    });
  }
  console.log('[News] Done');
}

main().catch(async err => {
  console.error('[News] Error:', err);
  if (process.env.SCRAPER_EMAIL_TO) {
    await sendScraperEmail({ success: false, error: err.message }).catch(e => console.error('[Email]', e));
  }
  process.exit(1);
});
