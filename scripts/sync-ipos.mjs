#!/usr/bin/env node
/**
 * Sync upcoming IPO calendars per exchange into data/ipos/{exchange}_ipos.json.
 * Drops offerings whose last relevant date is before today.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import * as cheerio from 'cheerio';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'ipos');

const UA = 'Mozilla/5.0 (compatible; DividendFlow-IPO-Sync/1.0)';

const INVESTING_COUNTRY_BY_EXCHANGE = {
  LSE: '4',
  HKEX: '39',
  TSE: '35',
  SSE: '37',
  TADAWUL: '52',
};

const EXCHANGE_ALIASES = {
  NYSE: ['NYSE', 'NEW YORK'],
  NASDAQ: ['NASDAQ'],
  LSE: ['LSE', 'LONDON', 'UK'],
  HKEX: ['HKEX', 'HONG KONG', 'HK'],
  TSE: ['TSE', 'TOKYO', 'JAPAN'],
  SSE: ['SSE', 'SHANGHAI', 'SHENZHEN', 'CHINA'],
  TADAWUL: ['TADAWUL', 'SAUDI', 'SAUDI ARABIA'],
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function parseUsMdy(value) {
  const m = String(value || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const mm = m[1].padStart(2, '0');
  const dd = m[2].padStart(2, '0');
  return `${m[3]}-${mm}-${dd}`;
}

function parseInvestingDate(text) {
  const m = String(text || '').trim().match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/);
  if (!m) return null;
  const d = new Date(`${m[1]} ${m[2]}, ${m[3]} 12:00:00 UTC`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function parsePriceRange(text) {
  const raw = String(text || '').replace(/[$,\s]/g, '');
  if (!raw) return { floor: null, cap: null };
  const parts = raw.split('-').map((p) => parseFloat(p)).filter((n) => Number.isFinite(n));
  if (!parts.length) return { floor: null, cap: null };
  if (parts.length === 1) return { floor: parts[0], cap: parts[0] };
  return { floor: Math.min(...parts), cap: Math.max(...parts) };
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

function lastRelevantDate(ipo) {
  const dates = [
    ipo.subscriptionEnd,
    ipo.subscriptionStart,
    ipo.bookBuildingEnd,
    ipo.registrationEnd,
  ].filter(Boolean);
  return dates.sort().pop() || null;
}

function isStillRelevant(ipo, asOf) {
  const last = lastRelevantDate(ipo);
  return Boolean(last && last >= asOf);
}

function mapExchangeLabel(label, fallback) {
  const upper = String(label || '').toUpperCase();
  for (const [code, aliases] of Object.entries(EXCHANGE_ALIASES)) {
    if (aliases.some((a) => upper.includes(a))) return code;
  }
  return fallback;
}

function normalizeRecord(raw) {
  const floor = raw.floorPrice ?? raw.floorPricePkr ?? null;
  const cap = raw.priceCap ?? raw.priceCapPkr ?? floor;
  return {
    id: raw.id,
    exchange: raw.exchange,
    country: raw.country || null,
    companyName: raw.companyName,
    symbol: raw.symbol || null,
    sector: raw.sector || '',
    offerType: raw.offerType || 'IPO',
    parentCompany: raw.parentCompany || null,
    issueSizeShares: raw.issueSizeShares ?? null,
    floorPrice: floor,
    priceCap: cap,
    currency: raw.currency || null,
    registrationStart: raw.registrationStart || null,
    registrationEnd: raw.registrationEnd || null,
    bookBuildingStart: raw.bookBuildingStart || null,
    bookBuildingEnd: raw.bookBuildingEnd || null,
    subscriptionStart: raw.subscriptionStart || null,
    subscriptionEnd: raw.subscriptionEnd || null,
    prospectusUrl: raw.prospectusUrl || null,
    companyUrl: raw.companyUrl || null,
    registerUrl: raw.registerUrl || null,
    source: raw.source || null,
    notes: raw.notes || null,
    updatedAt: raw.updatedAt || todayIso(),
  };
}

function readExchangeFile(exchange) {
  const filePath = path.join(DATA_DIR, `${exchange.toLowerCase()}_ipos.json`);
  if (!fs.existsSync(filePath)) return [];
  try {
    const rows = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(rows) ? rows.map(normalizeRecord) : [];
  } catch {
    return [];
  }
}

function writeExchangeFile(exchange, rows, asOf) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const kept = rows
    .map(normalizeRecord)
    .filter((row) => isStillRelevant(row, asOf))
    .sort((a, b) => (a.subscriptionStart || '').localeCompare(b.subscriptionStart || ''));
  const filePath = path.join(DATA_DIR, `${exchange.toLowerCase()}_ipos.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(kept, null, 2)}\n`);
  return kept.length;
}

function mergeById(existing, incoming) {
  const map = new Map(existing.map((row) => [row.id, row]));
  for (const row of incoming) {
    const prev = map.get(row.id);
    map.set(row.id, prev ? { ...prev, ...row, updatedAt: todayIso() } : row);
  }
  return [...map.values()];
}

async function fetchNasdaqUs() {
  const { data } = await axios.get('https://api.nasdaq.com/api/ipo/calendar', {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    timeout: 30000,
  });
  const rows = data?.data?.upcoming?.upcomingTable?.rows || [];
  const asOf = todayIso();
  const out = { NYSE: [], NASDAQ: [] };

  for (const row of rows) {
    const exchange = mapExchangeLabel(row.proposedExchange, null);
    if (!exchange || !out[exchange]) continue;
    const ipoDate = parseUsMdy(row.expectedPriceDate);
    if (!ipoDate || ipoDate < asOf) continue;
    const { floor, cap } = parsePriceRange(row.proposedSharePrice);
    out[exchange].push(
      normalizeRecord({
        id: `nasdaq-${row.dealID}`,
        exchange,
        country: 'US',
        companyName: row.companyName,
        symbol: row.proposedTickerSymbol,
        offerType: 'IPO',
        floorPrice: floor,
        priceCap: cap,
        currency: 'USD',
        subscriptionStart: ipoDate,
        subscriptionEnd: ipoDate,
        registerUrl: 'https://www.nasdaq.com/market-activity/ipos',
        source: 'api.nasdaq.com',
        notes: 'Expected pricing date from Nasdaq IPO calendar. Apply via your US brokerage when the retail offer opens.',
        updatedAt: asOf,
      })
    );
  }
  return out;
}

async function fetchInvestingForExchange(exchange) {
  const countryId = INVESTING_COUNTRY_BY_EXCHANGE[exchange];
  if (!countryId) return [];

  const asOf = todayIso();
  const dateTo = addDays(asOf, 180);
  const { data } = await axios.get(
    'https://www.investing.com/ipo-calendar/Service/getCalendarFilteredData',
    {
      params: {
        country_ids: countryId,
        dateFrom: asOf,
        dateTo,
      },
      headers: {
        'User-Agent': UA,
        'X-Requested-With': 'XMLHttpRequest',
      },
      timeout: 30000,
    }
  );

  const html = data?.data || '';
  const $ = cheerio.load(html);
  const rows = [];

  $('tr').each((_, tr) => {
    const cells = $(tr).find('td');
    if (cells.length < 4) return;
    const ipoDate = parseInvestingDate($(cells[0]).text());
    if (!ipoDate || ipoDate < asOf) return;
    const nameCell = $(cells[1]).text().replace(/\s+/g, ' ').trim();
    const symbolMatch = nameCell.match(/\(([A-Z0-9.\-]+)\)/);
    const companyName = nameCell.replace(/\([^)]*\)/, '').trim();
    const marketLabel = $(cells[2]).text().trim();
    const mappedExchange = mapExchangeLabel(marketLabel, exchange);
    if (mappedExchange !== exchange) return;
    const { floor, cap } = parsePriceRange($(cells[4])?.text() || $(cells[3])?.text());
    const currencyMap = {
      LSE: 'GBP',
      HKEX: 'HKD',
      TSE: 'JPY',
      SSE: 'CNY',
      TADAWUL: 'SAR',
    };

    rows.push(
      normalizeRecord({
        id: `investing-${exchange.toLowerCase()}-${slugify(companyName)}-${ipoDate}`,
        exchange,
        country: null,
        companyName,
        symbol: symbolMatch ? symbolMatch[1] : null,
        floorPrice: floor,
        priceCap: cap,
        currency: currencyMap[exchange] || null,
        subscriptionStart: ipoDate,
        subscriptionEnd: ipoDate,
        source: 'investing.com',
        notes: 'Dates from Investing.com IPO calendar. Confirm on the official exchange or prospectus before subscribing.',
        updatedAt: asOf,
      })
    );
  });

  return rows;
}

function pruneManualPsx(existing, asOf) {
  return existing
    .map(normalizeRecord)
    .filter((row) => isStillRelevant(row, asOf));
}

async function main() {
  const asOf = todayIso();
  const summary = {};

  try {
    const us = await fetchNasdaqUs();
    for (const code of ['NYSE', 'NASDAQ']) {
      const count = writeExchangeFile(code, us[code] || [], asOf);
      summary[code] = count;
    }
  } catch (err) {
    console.warn('Nasdaq IPO sync failed:', err.message);
    for (const code of ['NYSE', 'NASDAQ']) {
      summary[code] = writeExchangeFile(code, readExchangeFile(code), asOf);
    }
  }

  for (const exchange of Object.keys(INVESTING_COUNTRY_BY_EXCHANGE)) {
    try {
      const scraped = await fetchInvestingForExchange(exchange);
      const count = writeExchangeFile(exchange, scraped, asOf);
      summary[exchange] = count;
    } catch (err) {
      console.warn(`${exchange} investing sync failed:`, err.message);
      summary[exchange] = writeExchangeFile(exchange, readExchangeFile(exchange), asOf);
    }
  }

  const psxManual = pruneManualPsx(readExchangeFile('PSX'), asOf);
  summary.PSX = writeExchangeFile('PSX', psxManual, asOf);

  console.log(`IPO sync complete (as of ${asOf}):`, summary);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
