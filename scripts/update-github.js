#!/usr/bin/env node
/**
 * Update GitHub repo with scraped CSV data
 * Requires: GITHUB_TOKEN, GITHUB_REPO (e.g. AmmarJamshed/DividendFlowPK)
 */
import axios from 'axios';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = process.env.GITHUB_REPO || 'AmmarJamshed/DividendFlowPK';
const TOKEN = process.env.GITHUB_TOKEN;

function csvEscape(val) {
  const s = String(val ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toDividendCsv(rows) {
  const headers = ['Company', 'Sector', 'Dividend_per_share', 'Payment_month', 'Dividend_yield', 'Price', 'Year'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map(h => csvEscape(r[h] || r[h.toLowerCase()])).join(','));
  }
  return lines.join('\n');
}

export function toCyclesCsv(rows) {
  const headers = ['Company', 'Sector', 'Fiscal_Year_End', 'Quarter_End_Months', 'Dividend_Announcement_Period', 'Book_Closure_Month', 'Estimated_Payment_Month'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map(h => csvEscape(r[h] || r[h.toLowerCase()])).join(','));
  }
  return lines.join('\n');
}

async function getFileSha(path) {
  const { data } = await axios.get(`https://api.github.com/repos/${REPO}/contents/${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  return data.sha;
}

async function updateFile(path, content, message) {
  let sha;
  try {
    sha = await getFileSha(path);
  } catch {
    sha = null;
  }
  await axios.put(`https://api.github.com/repos/${REPO}/contents/${path}`, {
    message,
    content: Buffer.from(content).toString('base64'),
    sha,
  }, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
}

export async function pushToGitHub(dividends, reportingCycles) {
  if (!TOKEN) {
    console.error('GITHUB_TOKEN required');
    return false;
  }
  const ts = new Date().toISOString().slice(0, 19);
  const msg = `Auto-update PSX data: ${ts}`;

  await updateFile('data/dividends/psx_dividend_calendar.csv', toDividendCsv(dividends), msg);
  await updateFile('data/financials/psx_quarter_cycles.csv', toCyclesCsv(reportingCycles), msg);
  const pricesPath = join(__dirname, '..', 'data', 'prices', 'daily_prices.csv');
  if (existsSync(pricesPath)) {
    await updateFile('data/prices/daily_prices.csv', readFileSync(pricesPath, 'utf-8'), msg);
  }
  console.log('Pushed to GitHub:', msg);
  return true;
}

export async function pushNewsToGitHub() {
  if (!TOKEN) {
    console.error('GITHUB_TOKEN required');
    return false;
  }
  const { readFileSync, existsSync } = await import('fs');
  const { join } = await import('path');
  const dataDir = join(__dirname, '..', 'data');
  const newsPath = join(dataDir, 'news');
  const pricesPath = join(dataDir, 'prices');
  if (!existsSync(join(newsPath, 'daily_news.csv'))) {
    console.log('No news file to push');
    return false;
  }
  const ts = new Date().toISOString().slice(0, 19);
  const msg = `Daily news + prices + AI commentary: ${ts}`;
  await updateFile('data/news/daily_news.csv', readFileSync(join(newsPath, 'daily_news.csv'), 'utf-8'), msg);
  if (existsSync(join(newsPath, 'ai_commentary.csv'))) {
    await updateFile('data/news/ai_commentary.csv', readFileSync(join(newsPath, 'ai_commentary.csv'), 'utf-8'), msg);
  }
  if (existsSync(join(newsPath, 'price_commentary.csv'))) {
    await updateFile('data/news/price_commentary.csv', readFileSync(join(newsPath, 'price_commentary.csv'), 'utf-8'), msg);
  }
  if (existsSync(join(pricesPath, 'daily_prices.csv'))) {
    await updateFile('data/prices/daily_prices.csv', readFileSync(join(pricesPath, 'daily_prices.csv'), 'utf-8'), msg);
  }
  if (existsSync(join(pricesPath, 'price_changes.csv'))) {
    await updateFile('data/prices/price_changes.csv', readFileSync(join(pricesPath, 'price_changes.csv'), 'utf-8'), msg);
  }
  const divPath = join(dataDir, 'dividends', 'psx_dividend_calendar.csv');
  if (existsSync(divPath)) {
    await updateFile('data/dividends/psx_dividend_calendar.csv', readFileSync(divPath, 'utf-8'), msg);
  }
  console.log('Pushed news + prices to GitHub:', msg);
  return true;
}
