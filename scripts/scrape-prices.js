#!/usr/bin/env node
/**
 * Daily PSX Price Scraper
 * Fetches current prices from PSX Terminal, compares to yesterday, computes change.
 * Used with run-news for price change commentary.
 */
import axios from 'axios';
import * as cheerio from 'cheerio';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
const PSX_TERMINAL_YIELDS = 'https://psxterminal.com/yields';
const USER_AGENT = 'DividendFlowPK/1.0 (PSX Dividend Intelligence; +https://github.com/AmmarJamshed/DividendFlowPK)';

function loadCompanies() {
  const path = join(DATA, 'dividends', 'psx_dividend_calendar.csv');
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, 'utf-8').split('\n').filter(Boolean);
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.replace(/^"|"$/g, '').trim());
    const row = {};
    headers.forEach((h, i) => row[h] = vals[i]);
    return row;
  });
  return [...new Set(rows.map(r => r.Company || r.company).filter(Boolean))];
}

/**
 * Load previous trading day's prices for comparison.
 * Uses rows from daily_prices.csv where date < today (most recent per company).
 * Falls back to dividend calendar if no history.
 */
export function loadPreviousPrices(today) {
  const todayStr = (today || new Date().toISOString().slice(0, 10));
  let path = join(DATA, 'prices', 'daily_prices.csv');
  if (!existsSync(path)) {
    path = join(DATA, 'dividends', 'psx_dividend_calendar.csv');
    if (!existsSync(path)) return new Map();
  }
  const lines = readFileSync(path, 'utf-8').split('\n').filter(Boolean);
  const headers = lines[0].split(',').map(h => h.trim());
  const companyIdx = headers.findIndex(h => /company/i.test(h));
  const priceIdx = headers.findIndex(h => /price/i.test(h));
  const dateIdx = headers.findIndex(h => /date/i.test(h));
  if (companyIdx < 0 || priceIdx < 0) return new Map();

  // If no date column (e.g. dividend calendar), use first row per company
  if (dateIdx < 0) {
    const map = new Map();
    const seen = new Set();
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',').map(v => v.replace(/^"|"$/g, '').trim());
      const company = vals[companyIdx];
      const price = parseFloat(vals[priceIdx]);
      if (company && price > 0 && !seen.has(company)) {
        map.set(company, price);
        seen.add(company);
      }
    }
    return map;
  }

  // Use only rows with date < today; per company, take most recent
  const byCompany = new Map(); // company -> { date, price }
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',').map(v => v.replace(/^"|"$/g, '').trim());
    const company = vals[companyIdx];
    const price = parseFloat(vals[priceIdx]);
    const date = vals[dateIdx] || '';
    if (!company || price <= 0 || !date || date >= todayStr) continue;
    const existing = byCompany.get(company);
    if (!existing || date > existing.date) byCompany.set(company, { date, price });
  }
  let map = new Map();
  for (const [company, { price }] of byCompany) map.set(company, price);
  // Fallback: if no yesterday data, use dividend calendar for comparison
  if (map.size === 0) {
    const divPath = join(DATA, 'dividends', 'psx_dividend_calendar.csv');
    if (existsSync(divPath)) {
      const divLines = readFileSync(divPath, 'utf-8').split('\n').filter(Boolean);
      const divHdrs = divLines[0]?.split(',').map(h => h.trim()) || [];
      const dcIdx = divHdrs.findIndex(h => /company/i.test(h));
      const dpIdx = divHdrs.findIndex(h => /price/i.test(h));
      if (dcIdx >= 0 && dpIdx >= 0) {
        const seen = new Set();
        for (let i = 1; i < divLines.length; i++) {
          const v = divLines[i].split(',').map(x => x.replace(/^"|"$/g, '').trim());
          const c = v[dcIdx];
          const p = parseFloat(v[dpIdx]);
          if (c && p > 0 && !seen.has(c)) {
            map.set(c, p);
            seen.add(c);
          }
        }
      }
    }
  }
  return map;
}

export async function scrapeCurrentPrices() {
  const companies = loadCompanies();
  const prices = new Map();
  try {
    const { data } = await axios.get(PSX_TERMINAL_YIELDS, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 15000,
    });
    const $ = cheerio.load(data);
    $('h3').each((_, el) => {
      const text = $(el).text().trim();
      const tickerMatch = text.match(/^([A-Z0-9]{2,12})$/);
      if (!tickerMatch) return;
      const ticker = tickerMatch[1];
      const card = $(el).closest('div').parent();
      const cardText = card.text();
      const priceMatch = cardText.match(/PKR\s+([\d,]+\.?\d*)/);
      const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : 0;
      if (price > 0 && companies.includes(ticker)) prices.set(ticker, price);
    });
    if (prices.size < 5 && /### [A-Z0-9]{2,12}/.test(data)) {
      const blocks = data.split(/### ([A-Z0-9]{2,12})/);
      for (let i = 1; i < blocks.length; i += 2) {
        const ticker = blocks[i];
        const block = blocks[i + 1] || '';
        const priceMatch = block.match(/PKR\s+([\d,]+\.?\d*)/) || block.match(/([\d,]+\.?\d*)/);
        const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : 0;
        if (price > 0 && companies.includes(ticker)) prices.set(ticker, price);
      }
    }
  } catch (err) {
    console.error('[Prices] Scrape error:', err.message);
  }
  return prices;
}

export function computePriceChanges(currentPrices, previousPrices) {
  const changes = [];
  for (const [company, price] of currentPrices) {
    const prev = previousPrices.get(company);
    if (!prev || prev <= 0) continue;
    const change = price - prev;
    const changePct = (change / prev) * 100;
    changes.push({
      Company: company,
      Price: price,
      PreviousPrice: prev,
      Change: Math.round(change * 100) / 100,
      ChangePct: Math.round(changePct * 100) / 100,
    });
  }
  return changes.sort((a, b) => Math.abs(b.ChangePct) - Math.abs(a.ChangePct));
}
