const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const axios = require('axios');
const { getSupabase, isSupabaseConfigured } = require('../db/supabaseClient');
const exchangeService = require('./exchangeService');

const DATA_PATH = path.join(__dirname, '..', '..', 'data');
const YAHOO_UA = 'Mozilla/5.0 (compatible; DividendFlow/1.0)';
let nameMapCache = null;
let yahooNameCache = new Map();

function isValidCompanyName(name, symbol) {
  const nm = String(name || '').trim();
  const sym = String(symbol || '').toUpperCase();
  if (!nm || nm.toUpperCase() === sym) return false;
  if (/^\d+$/.test(nm)) return false;
  if (nm.includes(',') || nm.includes('.KA') || nm.includes('0P0000')) return false;
  if (nm.length > 100) return false;
  return true;
}

function addName(map, symbol, name) {
  const sym = String(symbol || '').toUpperCase().trim();
  const nm = String(name || '').trim();
  if (!sym || !nm || !isValidCompanyName(nm, sym)) return;
  if (!map.has(sym)) map.set(sym, nm);
}

function readCsvFileSync(relativePath) {
  const fp = path.join(DATA_PATH, ...relativePath.split('/'));
  if (!fs.existsSync(fp)) return [];
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(fp)
      .pipe(csv())
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

async function loadNamesFromSupabase(map) {
  if (!isSupabaseConfigured()) return;
  const supabase = getSupabase();
  const exchangeId = await exchangeService.getExchangeId('PSX');
  if (!exchangeId) return;

  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('securities')
      .select('symbol, name')
      .eq('exchange_id', exchangeId)
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const batch = data || [];
    for (const row of batch) addName(map, row.symbol, row.name);
    if (batch.length < pageSize) break;
  }
}

async function loadNamesFromLocalCsv(map) {
  try {
    const payouts = await readCsvFileSync('dividends/psx_payouts.csv');
    for (const row of payouts) {
      addName(map, row.Company || row.company, row.CompanyName || row.company_name);
    }
  } catch (err) {
    console.warn('[psxSymbolNames] payouts csv:', err.message);
  }

  try {
    const calendar = await readCsvFileSync('dividends/psx_dividend_calendar.csv');
    for (const row of calendar) {
      const sym = row.Company || row.company;
      addName(map, sym, row.CompanyName || row.company_name || row.Name);
    }
  } catch (err) {
    console.warn('[psxSymbolNames] calendar csv:', err.message);
  }
}

async function loadPsxNameMap() {
  if (nameMapCache) return nameMapCache;
  const map = new Map();
  await loadNamesFromSupabase(map);
  await loadNamesFromLocalCsv(map);
  for (const [sym, nm] of yahooNameCache.entries()) addName(map, sym, nm);
  nameMapCache = map;
  return map;
}

function resolvePsxCompanyName(symbol, storedName, nameMap) {
  const sym = String(symbol || '').toUpperCase().trim();
  const fromMap = nameMap.get(sym);
  return exchangeService.resolveCompanyName(sym, 'PSX', fromMap || storedName);
}

async function fetchYahooCompanyName(symbol) {
  const sym = String(symbol || '').toUpperCase().trim();
  if (!sym) return null;
  const ticker = exchangeService.yfinanceTicker(sym, 'PSX');
  try {
    const { data } = await axios.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`,
      {
        params: { interval: '1d', range: '5d' },
        headers: { 'User-Agent': YAHOO_UA },
        timeout: 10000,
      }
    );
    const meta = data?.chart?.result?.[0]?.meta;
    const raw = meta?.longName || meta?.shortName || null;
    return isValidCompanyName(raw, sym) ? raw : null;
  } catch {
    return null;
  }
}

async function enrichPsxClosingRows(rows, { yahooLimit = 48 } = {}) {
  const nameMap = await loadPsxNameMap();
  const enriched = rows.map((row) => {
    const sym = String(row.symbol || '').toUpperCase().trim();
    const company = resolvePsxCompanyName(sym, row.company || row.name, nameMap);
    return { ...row, company };
  });

  const needsYahoo = enriched
    .filter((row) => {
      const sym = String(row.symbol || '').toUpperCase().trim();
      const company = String(row.company || '').trim();
      if (sym.includes('-')) return false;
      return !company || company.toUpperCase() === sym;
    })
    .sort((a, b) => (b.volume || 0) - (a.volume || 0))
    .slice(0, yahooLimit);

  if (needsYahoo.length) {
    for (const row of needsYahoo) {
      const sym = String(row.symbol || '').toUpperCase().trim();
      if (yahooNameCache.has(sym)) continue;
      const companyName = await fetchYahooCompanyName(sym);
      if (companyName) {
        yahooNameCache.set(sym, companyName);
        addName(nameMap, sym, companyName);
      }
      await new Promise((r) => setTimeout(r, 40));
    }
    nameMapCache = nameMap;
    return enriched.map((row) => ({
      ...row,
      company: resolvePsxCompanyName(row.symbol, row.company, nameMap),
    }));
  }

  return enriched;
}

function clearPsxNameCache() {
  nameMapCache = null;
  yahooNameCache = new Map();
}

module.exports = {
  loadPsxNameMap,
  resolvePsxCompanyName,
  enrichPsxClosingRows,
  clearPsxNameCache,
};
