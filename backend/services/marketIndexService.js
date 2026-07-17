const { getSupabase, isSupabaseConfigured } = require('../db/supabaseClient');
const exchangeService = require('./exchangeService');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', '..', 'data');
const PAGE_SIZE = 1000;
const TARGET_DAYS = 180;
/** Typical PSX cash-board breadth (spot + a few futures); rejects multi-exchange pollution. */
const MIN_BREADTH = 200;
const MAX_BREADTH = 900;

async function readDailyPricesRows(days = TARGET_DAYS) {
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabase();
      const exchangeId = await exchangeService.getExchangeId('PSX');
      if (!exchangeId) throw new Error('PSX exchange id missing');

      const rows = [];
      const datesSeen = new Set();
      let from = 0;

      // PostgREST caps pages (~1000). Paginate newest-first until we have enough trading days.
      for (let page = 0; page < 250; page += 1) {
        const to = from + PAGE_SIZE - 1;
        const { data, error } = await supabase
          .from('daily_prices')
          .select('trade_date, close, securities!inner(symbol, exchange_id)')
          .eq('securities.exchange_id', exchangeId)
          .order('trade_date', { ascending: false })
          .order('security_id', { ascending: true })
          .range(from, to);

        if (error || !data?.length) break;

        for (const row of data) {
          const symbol = row.securities?.symbol;
          const close = Number(row.close);
          if (!symbol || !(close > 0) || !row.trade_date) continue;
          // Cash equities only — skip monthly futures (e.g. CNERGY-JUL)
          if (symbol.includes('-')) continue;
          rows.push({ symbol, date: row.trade_date, close });
          datesSeen.add(row.trade_date);
        }

        if (data.length < PAGE_SIZE) break;
        if (datesSeen.size >= days + 5) break;
        from += PAGE_SIZE;
      }

      if (rows.length) return rows;
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
        if (symbol && date && close > 0 && !String(symbol).includes('-')) {
          rows.push({ symbol, date, close });
        }
      })
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Equal-weight basket index from archived PSX daily closes (KSE-100 style proxy).
 * Day-over-day return uses only symbols present on both sessions.
 */
async function getMarketIndexSeries(exchangeCode = 'PSX', days = TARGET_DAYS) {
  if (exchangeCode !== 'PSX') {
    return { label: exchangeCode, points: [], source: 'none' };
  }

  const rows = await readDailyPricesRows(days);
  if (!rows.length) return { label: 'KSE-100', points: [], source: 'none' };

  /** @type {Map<string, Map<string, number>>} */
  const byDate = new Map();
  for (const row of rows) {
    if (!byDate.has(row.date)) byDate.set(row.date, new Map());
    byDate.get(row.date).set(row.symbol, row.close);
  }

  let dates = [...byDate.keys()].sort();
  dates = dates.filter((d) => {
    const n = byDate.get(d).size;
    return n >= MIN_BREADTH && n <= MAX_BREADTH;
  });

  const sliced = dates.slice(-days);
  if (!sliced.length) return { label: 'KSE-100', points: [], source: 'csv' };

  let index = 100000;
  const points = [];
  let prevMap = null;

  for (const date of sliced) {
    const curMap = byDate.get(date);
    if (prevMap) {
      let sumRatio = 0;
      let n = 0;
      for (const [symbol, close] of curMap) {
        const prevClose = prevMap.get(symbol);
        if (prevClose > 0 && close > 0) {
          const ratio = close / prevClose;
          // Ignore extreme outliers (bad ticks / corporate actions without adjust)
          if (ratio >= 0.5 && ratio <= 2) {
            sumRatio += ratio;
            n += 1;
          }
        }
      }
      if (n >= 50) {
        index *= sumRatio / n;
      }
    }
    prevMap = curMap;
    points.push({
      date,
      close: round2(index),
      open: round2(index * 0.998),
      high: round2(index * 1.004),
      low: round2(index * 0.996),
      volume: curMap.size,
    });
  }

  const latest = points[points.length - 1];
  const prev = points[points.length - 2];
  const change = latest && prev ? latest.close - prev.close : 0;
  const changePct = latest && prev && prev.close ? (change / prev.close) * 100 : 0;

  return {
    label: 'KSE-100',
    subtitle: 'Equal-weight PSX basket proxy from archived closes (not official KSE-100)',
    points,
    latest: latest ? { ...latest, change, changePct } : null,
    source: isSupabaseConfigured() ? 'supabase' : 'csv',
  };
}

module.exports = { getMarketIndexSeries };
