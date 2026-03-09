#!/usr/bin/env node
/**
 * Daily news scraper + Groq commentary + push to GitHub
 * Schedule: 2:00 UTC (7am PKT) - before market open
 */
import { scrapePsxNews } from './scrape-news.js';
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

async function main() {
  console.log('[News] Starting...');
  const { news, commentary } = await scrapePsxNews();
  console.log('[News] Matched', news.length, 'articles for', [...new Set(news.map(n => n.Company))].length, 'companies');
  console.log('[News] AI commentary for', commentary.length, 'companies');

  mkdirSync(join(DATA, 'news'), { recursive: true });

  const toCsv = (rows, headers) => {
    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push(headers.map(h => csvEscape(r[h])).join(','));
    }
    return lines.join('\n');
  };

  writeFileSync(
    join(DATA, 'news', 'daily_news.csv'),
    toCsv(news, ['Company', 'Headline', 'Date', 'Source', 'Url'])
  );
  writeFileSync(
    join(DATA, 'news', 'ai_commentary.csv'),
    toCsv(commentary, ['Company', 'Commentary', 'Date'])
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
