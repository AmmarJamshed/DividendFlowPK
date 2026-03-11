#!/usr/bin/env node
/**
 * Daily news + price scraper + Groq commentary + push to GitHub
 * Schedule: 12:00 UTC (5pm PKT) - after market close
 */
import { scrapePsxNews, getGroqPriceCommentary } from './scrape-news.js';
import { scrapeCurrentPrices, computePriceChanges, loadPreviousPrices } from './scrape-prices.js';
import { pushNewsToGitHub } from './update-github.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');

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

  const currentPrices = await scrapeCurrentPrices();
  const previousPrices = loadPreviousPrices();
  const priceChanges = computePriceChanges([...currentPrices], previousPrices);
  console.log('[Prices] Scraped', currentPrices.size, 'prices,', priceChanges.length, 'with day-over-day change');

  const dailyPrices = [...currentPrices].map(([Company, Price]) => ({ Company, Date: today, Price }));
  writeFileSync(
    join(DATA, 'prices', 'daily_prices.csv'),
    toCsv(dailyPrices, ['Company', 'Date', 'Price'])
  );

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
