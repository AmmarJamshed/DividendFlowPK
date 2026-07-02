const { getSupabase, isSupabaseConfigured } = require('../db/supabaseClient');
const dataStore = require('./dataStore');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', '..', 'data');

async function readDailyPricesRows() {
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('daily_prices')
        .select('trade_date, close, securities!inner(symbol)')
        .order('trade_date', { ascending: false })
        .limit(50000);
      if (!error && data?.length) {
        return data.map((row) => ({
          symbol: row.securities?.symbol,
          date: row.trade_date,
          close: Number(row.close),
        }));
      }
    } catch {
      /* fall through */
    }
  }

  const fp = path.join(DATA_PATH, 'prices', 'daily_prices.csv');
  if (!fs.existsSync(fp)) return [];

  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(fp)
      .pipe(csv())
      .on('data', (d) => {
        const symbol = d.Company || d.company || d.symbol;
        const date = d.Date || d.date;
        const close = parseFloat(d.Price || d.close || d.price);
        if (symbol && date && close > 0) rows.push({ symbol, date, close });
      })
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

/**
 * Equal-weight basket index from archived daily closes (KSE-100 style proxy).
 */
async function getMarketIndexSeries(exchangeCode = 'PSX', days = 180) {
  if (exchangeCode !== 'PSX') {
    return { label: exchangeCode, points: [], source: 'none' };
  }

  const rows = await readDailyPricesRows();
  if (!rows.length) return { label: 'KSE-100', points: [], source: 'none' };

  const byDate = new Map();
  for (const row of rows) {
    if (!byDate.has(row.date)) byDate.set(row.date, []);
    byDate.get(row.date).push(row.close);
  }

  const dates = [...byDate.keys()].sort();
  const sliced = dates.slice(-days);
  if (!sliced.length) return { label: 'KSE-100', points: [], source: 'csv' };

  let index = 100000;
  const points = [];
  let prevAvg = null;

  for (const date of sliced) {
    const prices = byDate.get(date);
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    if (prevAvg != null && prevAvg > 0) {
      index *= avg / prevAvg;
    }
    prevAvg = avg;
    points.push({
      date,
      close: Math.round(index * 100) / 100,
      open: Math.round(index * 0.998 * 100) / 100,
      high: Math.round(index * 1.004 * 100) / 100,
      low: Math.round(index * 0.996 * 100) / 100,
      volume: prices.length,
    });
  }

  const latest = points[points.length - 1];
  const prev = points[points.length - 2];
  const change = latest && prev ? latest.close - prev.close : 0;
  const changePct = latest && prev && prev.close ? (change / prev.close) * 100 : 0;

  return {
    label: 'KSE-100',
    subtitle: 'Equal-weight basket proxy from archived PSX closes',
    points,
    latest: latest
      ? { ...latest, change, changePct }
      : null,
    source: isSupabaseConfigured() ? 'supabase' : 'csv',
  };
}

module.exports = { getMarketIndexSeries };
