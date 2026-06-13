const axios = require('axios');

const UA = 'DividendFlow-Ingest/1.0';

async function fetchText(url, timeout = 60000) {
  const { data } = await axios.get(url, {
    timeout,
    headers: { 'User-Agent': UA },
    responseType: 'text',
  });
  return String(data || '');
}

function parsePipeTable(text) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('File Creation'));
  if (!lines.length) return { headers: [], rows: [] };
  const headers = lines[0].split('|').map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cols = line.split('|').map((c) => c.trim());
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? '';
    });
    return row;
  });
  return { headers, rows };
}

function cleanYahooSymbol(sym) {
  return String(sym || '')
    .trim()
    .replace(/[^A-Za-z0-9.\-^]/g, '');
}

async function fetchNasdaqSymbols() {
  const text = await fetchText('https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt');
  const { rows } = parsePipeTable(text);
  const out = new Set();
  for (const row of rows) {
    if (row['Test Issue'] !== 'N') continue;
    if (row.ETF === 'Y') continue;
    const s = cleanYahooSymbol(row.Symbol);
    if (s && s.toLowerCase() !== 'nan') out.add(s);
  }
  return [...out].sort();
}

async function fetchNyseSymbols() {
  const text = await fetchText('https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt');
  const { rows } = parsePipeTable(text);
  const out = new Set();
  for (const row of rows) {
    if (row['Test Issue'] !== 'N') continue;
    if (row.ETF === 'Y') continue;
    if (!['N', 'A', 'P'].includes(row.Exchange)) continue;
    const raw = row['NASDAQ Symbol'] || row.Symbol;
    const s = cleanYahooSymbol(raw);
    if (s && s.toLowerCase() !== 'nan') out.add(s);
  }
  return [...out].sort();
}

async function fetchUniverseSymbols(exchangeCode) {
  const code = String(exchangeCode || '').toUpperCase();
  if (code === 'NASDAQ') return fetchNasdaqSymbols();
  if (code === 'NYSE') return fetchNyseSymbols();
  throw new Error(`No Node universe fetcher for ${code}`);
}

module.exports = {
  fetchUniverseSymbols,
  fetchNasdaqSymbols,
  fetchNyseSymbols,
};
