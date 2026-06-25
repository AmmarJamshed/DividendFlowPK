const { getSupabase, isSupabaseConfigured } = require('../db/supabaseClient');
const exchangeService = require('./exchangeService');
const dataStore = require('./dataStore');
const { ensureExchangeUniverse, FULL_UNIVERSE } = require('./universeSync');

const CURATED_ENRICH_MAX = 40;

function dedupeRowsBySymbol(rows) {
  const bySymbol = new Map();
  for (const row of rows) {
    const sym = row.symbol;
    if (!sym) continue;
    const existing = bySymbol.get(sym);
    if (!existing || (row.close != null && existing.close == null)) {
      bySymbol.set(sym, row);
    }
  }
  return [...bySymbol.values()];
}

async function supplementCuratedFromSeeds(code, displayRows) {
  if (FULL_UNIVERSE.has(code)) return displayRows;
  const cfg = exchangeService.getExchangeConfig(code);
  const target = (cfg?.newsSeedSymbols || []).length;
  if (!target || displayRows.length >= target) return displayRows;

  const have = new Set(displayRows.map((r) => r.symbol));
  const { fetchSeedClosingRows } = require('./exchangeNews');
  const seeds = await fetchSeedClosingRows(code);
  const extra = seeds.filter((r) => r.symbol && !have.has(r.symbol));
  return extra.length ? [...displayRows, ...extra] : displayRows;
}

async function finalizeClosingRows(code, displayRows) {
  const rows = dedupeRowsBySymbol(displayRows).map((row) => ({
    ...row,
    company: exchangeService.resolveCompanyName(row.symbol, code, row.company),
  }));

  const yahooEnrich = process.env.ENRICH_CLOSING_YAHOO === '1';
  if (yahooEnrich && !FULL_UNIVERSE.has(code) && rows.length > 0 && rows.length <= CURATED_ENRICH_MAX) {
    const { enrichClosingRowsFromYahoo, rowNeedsYahooEnrichment } = require('./exchangeNews');
    if (rows.some((r) => rowNeedsYahooEnrichment(r, code))) {
      return enrichClosingRowsFromYahoo(code, rows);
    }
  }
  return rows;
}

async function getClosingPrices(exchangeCode) {
  const code = exchangeService.normalizeExchangeCode(exchangeCode);

  if (code === 'PSX') {
    if (isSupabaseConfigured()) {
      try {
        const payload = await getGlobalClosingPricesFromSupabase(code);
        if ((payload.rows || []).length > 0) {
          const { enrichPsxClosingRows } = require('./psxSymbolNames');
          const rows = await enrichPsxClosingRows(payload.rows);
          return { ...payload, rows };
        }
      } catch (err) {
        console.warn('[globalDataStore] PSX Supabase closing prices failed:', err.message);
      }
    }

    const { rows } = await dataStore.readMarketData('prices/psx_full_dataset.csv', async (fp) => {
      const csv = require('csv-parser');
      const fs = require('fs');
      return new Promise((resolve, reject) => {
        if (!fs.existsSync(fp)) return resolve([]);
        const results = [];
        fs.createReadStream(fp)
          .pipe(csv())
          .on('data', (d) => results.push(d))
          .on('end', () => resolve(results))
          .on('error', reject);
      });
    });
    const formatted = formatPsxRows(rows, code);
    const { enrichPsxClosingRows } = require('./psxSymbolNames');
    formatted.rows = await enrichPsxClosingRows(formatted.rows);
    return formatted;
  }

  if (!isSupabaseConfigured()) {
    const fallback = await fetchSeedClosingPrices(code);
    if (fallback.rows.length) return fallback;
    return { exchange: code, rows: [], date: null, source: 'none' };
  }

  try {
    return await getGlobalClosingPricesFromSupabase(code);
  } catch (err) {
    console.warn('[globalDataStore] Supabase closing prices failed:', code, err.message);
    const fallback = await fetchSeedClosingPrices(code);
    if (fallback.rows.length) return fallback;
    throw err;
  }
}

async function getGlobalClosingPricesFromSupabase(code) {
  const exchangeId = await exchangeService.getExchangeId(code);
  if (!exchangeId) {
    const fallback = await fetchSeedClosingPrices(code);
    if (fallback.rows.length) return fallback;
    return { exchange: code, rows: [], date: null, source: 'supabase' };
  }

  let universeMeta = null;
  if (FULL_UNIVERSE.has(code)) {
    try {
      universeMeta = await Promise.race([
        ensureExchangeUniverse(code),
        new Promise((resolve) => setTimeout(() => resolve({ synced: false, reason: 'timeout' }), 20000)),
      ]);
    } catch (err) {
      console.warn('[globalDataStore] universe sync:', code, err.message);
    }
  }

  const supabase = getSupabase();
  const secs = await fetchAllActiveSecurities(supabase, exchangeId);
  if (!secs.length) {
    const fallback = await fetchSeedClosingPrices(code);
    if (fallback.rows.length) return { ...fallback, universe: universeMeta };
    return { exchange: code, rows: [], date: null, source: 'supabase', universe: universeMeta };
  }

  const secIds = secs.map((s) => s.id);
  const recentBySecId = await fetchRecentPricesBatched(supabase, secIds);

  const cfg = exchangeService.getExchangeConfig(code);
  let maxDate = null;
  const rows = [];
  for (const sec of secs) {
    const history = recentBySecId.get(sec.id) || [];
    const latest = history[0];
    const derived = deriveSessionMove(history);
    const weekChgPct = deriveWeekChange(history, latest?.trade_date);
    if (latest?.trade_date && (!maxDate || latest.trade_date > maxDate)) maxDate = latest.trade_date;
    const listingSymbol = exchangeService.normalizeListingSymbol(sec.symbol, code);
    rows.push({
      symbol: listingSymbol,
      company: exchangeService.resolveCompanyName(listingSymbol, code, sec.name || listingSymbol),
      sector: sec.sector || '',
      close: latest ? num(latest.close) : null,
      change: derived.change,
      changePct: derived.changePct,
      volume: latest?.volume || 0,
      open: latest ? num(latest.open) : null,
      high: latest ? num(latest.high) : null,
      low: latest ? num(latest.low) : null,
      currency: (latest?.currency || cfg.currency),
      exchange: code,
      weekChgPct,
    });
  }

  const withPrices = rows.filter((row) => row.close != null && row.close > 0).length;
  const date = maxDate;
  let displayRows = rows.filter((row) => row.close != null && row.close > 0);

  if (displayRows.length > 0) {
    displayRows = await finalizeClosingRows(code, displayRows);
  }

  const payload = {
    exchange: code,
    currency: cfg.currency,
    rows: displayRows,
    date,
    source: withPrices > 0 ? 'supabase' : 'supabase',
    meta: {
      totalSymbols: rows.length,
      withPrices,
      universe: universeMeta,
    },
  };

  if (withPrices === 0) {
    const fallback = await fetchSeedClosingPrices(code);
    if (fallback.rows.length) {
      return {
        ...fallback,
        meta: {
          totalSymbols: fallback.rows.length,
          withPrices: fallback.rows.length,
          universe: universeMeta,
          note: 'Preview quotes until full ingest completes',
        },
      };
    }
  }

  return payload;
}

const SEC_ID_CHUNK = 120;
const RECENT_ROWS_PER_SECURITY = 12;

function subtractDaysIso(isoDateStr, days) {
  if (!isoDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(isoDateStr)) return null;
  const [y, m, d] = isoDateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - days);
  return dt.toISOString().slice(0, 10);
}

function deriveSessionMove(history) {
  const latest = history[0];
  const previous = history[1];
  const close = num(latest?.close);
  const prevClose = num(previous?.close);
  if (close == null || prevClose == null || prevClose <= 0) {
    return { change: null, changePct: null };
  }
  const change = Math.round((close - prevClose) * 10000) / 10000;
  const changePct = Math.round((change / prevClose) * 10000) / 100;
  return { change, changePct };
}

function deriveWeekChange(history, sessionDate) {
  const latest = history[0];
  const close = num(latest?.close);
  if (close == null || close <= 0 || !sessionDate) return null;
  const targetDate = subtractDaysIso(sessionDate, 7);
  if (!targetDate) return null;
  let weekClose = null;
  for (const row of history.slice(1)) {
    if (!row?.trade_date || row.trade_date > sessionDate) continue;
    if (row.trade_date <= targetDate) {
      weekClose = num(row.close);
      break;
    }
  }
  if (weekClose == null || weekClose <= 0) return null;
  return Math.round(((close - weekClose) / weekClose) * 10000) / 100;
}

async function fetchAllActiveSecurities(supabase, exchangeId) {
  const pageSize = 1000;
  const all = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('securities')
      .select('id, symbol, name, sector')
      .eq('exchange_id', exchangeId)
      .eq('active', true)
      .order('symbol', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const batch = data || [];
    all.push(...batch);
    if (batch.length < pageSize) break;
  }
  return all;
}

async function fetchRecentPricesBatched(supabase, secIds) {
  const recentBySecId = new Map();
  for (let i = 0; i < secIds.length; i += SEC_ID_CHUNK) {
    const chunk = secIds.slice(i, i + SEC_ID_CHUNK);
    const { data, error } = await supabase
      .from('daily_prices')
      .select('security_id, trade_date, open, high, low, close, change_amount, change_pct, volume, currency')
      .in('security_id', chunk)
      .order('trade_date', { ascending: false })
      .limit(chunk.length * RECENT_ROWS_PER_SECURITY);
    if (error) throw error;
    for (const r of data || []) {
      if (!recentBySecId.has(r.security_id)) recentBySecId.set(r.security_id, []);
      const arr = recentBySecId.get(r.security_id);
      if (arr.length < RECENT_ROWS_PER_SECURITY) arr.push(r);
    }
  }
  return recentBySecId;
}

async function fetchSeedClosingPrices(exchangeCode) {
  const { fetchSeedClosingRows } = require('./exchangeNews');
  const code = exchangeService.normalizeExchangeCode(exchangeCode);
  const cfg = exchangeService.getExchangeConfig(code);
  const rawRows = await fetchSeedClosingRows(code);
  const rows = await finalizeClosingRows(code, rawRows);
  const date = rows[0]?.tradeDate || null;
  return {
    exchange: code,
    currency: cfg.currency,
    rows,
    date,
    source: 'yahoo_seeds',
  };
}

function formatPsxRows(rows, code) {
  const parseNum = (s) => {
    if (s == null || s === '') return 0;
    const v = String(s).replace(/,/g, '').replace('%', '').trim();
    return parseFloat(v) || 0;
  };
  const formatted = (rows || []).map((r) => {
    const symbol = (r.symbol || r.Symbol || '').trim();
    return {
      symbol,
      company: (r.company || r.Company || symbol).trim(),
      close: parseNum(r.close || r.Close),
      change: parseNum(r.change || r.Change),
      changePct: parseNum(r.change_pct || r.ChangePct || r['change_pct']),
      volume: parseInt(String(r.volume || r.Volume || '0').replace(/,/g, ''), 10) || 0,
      open: parseNum(r.open || r.Open),
      high: parseNum(r.high || r.High),
      low: parseNum(r.low || r.Low),
      currency: 'PKR',
      exchange: code,
    };
  });
  const date = rows[0]?.date || rows[0]?.Date || null;
  return { exchange: code, currency: 'PKR', rows: formatted, date, source: 'psx' };
}

function num(v) {
  if (v == null) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

let psxSymbolIndexCache = null;

async function loadPsxSymbolIndex() {
  if (psxSymbolIndexCache) return psxSymbolIndexCache;
  const entries = new Map();

  const add = (symbol, name) => {
    const sym = String(symbol || '').toUpperCase().trim();
    if (!sym) return;
    const nm = String(name || sym).trim();
    entries.set(sym, { symbol: sym, name: nm, exchange: 'PSX' });
  };

  const readCsvRows = async (rel) => {
    const { rows } = await dataStore.readMarketData(rel, async (fp) => {
      const csv = require('csv-parser');
      const fs = require('fs');
      return new Promise((resolve, reject) => {
        if (!fs.existsSync(fp)) return resolve([]);
        const results = [];
        fs.createReadStream(fp)
          .pipe(csv())
          .on('data', (d) => results.push(d))
          .on('end', () => resolve(results))
          .on('error', reject);
      });
    });
    return rows || [];
  };

  try {
    for (const row of await readCsvRows('dividends/psx_dividend_calendar.csv')) {
      add(row.Company || row.company, row.Company || row.company);
    }
    for (const row of await readCsvRows('dividends/psx_payouts.csv')) {
      add(row.Company || row.company, row.CompanyName || row.Company || row.company);
    }
    const psx = await getClosingPrices('PSX');
    for (const r of psx.rows || []) add(r.symbol, r.company || r.symbol);
  } catch (err) {
    console.warn('[globalDataStore] PSX symbol index load failed:', err.message);
  }

  psxSymbolIndexCache = [...entries.values()];
  return psxSymbolIndexCache;
}

function scoreSymbolMatch(query, entry) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return 0;
  const sym = entry.symbol.toLowerCase();
  const name = String(entry.name || '').toLowerCase();
  if (sym === q) return 100;
  if (name === q) return 95;
  if (sym.startsWith(q)) return 80;
  if (name.startsWith(q)) return 75;
  if (name.includes(q)) return 60;
  if (sym.includes(q)) return 50;
  const words = q.split(/\s+/).filter((w) => w.length >= 3);
  if (words.every((w) => name.includes(w))) return 70;
  if (words.some((w) => name.includes(w) || sym.includes(w))) return 40;
  return 0;
}

async function searchLocalPsx(query, limit = 20) {
  const index = await loadPsxSymbolIndex();
  const q = String(query || '').trim();
  if (!q) return [];
  return index
    .map((e) => ({ ...e, score: scoreSymbolMatch(q, e) }))
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score, ...rest }) => rest);
}

async function searchSecurities(query, limit = 20) {
  const q = String(query || '').trim();
  if (!q || q.length < 1) return [];

  const local = await searchLocalPsx(q, limit);
  if (local.length) return local;

  if (!isSupabaseConfigured()) {
    const psx = await getClosingPrices('PSX');
    return (psx.rows || [])
      .filter((r) => r.symbol.toUpperCase().includes(q.toUpperCase()) || r.company.toUpperCase().includes(q.toUpperCase()))
      .slice(0, limit)
      .map((r) => ({ symbol: r.symbol, name: r.company, exchange: 'PSX', sector: r.sector || '' }));
  }

  const exchangeId = await exchangeService.getExchangeId('PSX');
  if (!exchangeId) return searchLocalPsx(q, limit);

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('securities')
    .select('symbol, name, sector, exchange_id')
    .eq('exchange_id', exchangeId)
    .or(`symbol.ilike.%${q}%,name.ilike.%${q}%`)
    .eq('active', true)
    .limit(limit);

  if (error) throw error;
  const remote = (data || []).map((r) => ({
    symbol: r.symbol,
    name: r.name || r.symbol,
    sector: r.sector || '',
    exchange: 'PSX',
  }));

  if (remote.length) return remote;

  return searchLocalPsx(q, limit);
}

async function searchSecuritiesForExchange(query, exchangeCode, limit = 5) {
  const code = exchangeService.normalizeExchangeCode(exchangeCode);
  const q = String(query || '').trim();
  if (!q) return [];

  if (code === 'PSX') {
    const local = await searchLocalPsx(q, limit * 2);
    if (local.length) return local.slice(0, limit);
  }

  if (!isSupabaseConfigured()) {
    return (await searchSecurities(q, limit * 3)).filter((r) => r.exchange === code).slice(0, limit);
  }

  const exchangeId = await exchangeService.getExchangeId(code);
  if (!exchangeId) return code === 'PSX' ? searchLocalPsx(q, limit) : [];

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('securities')
    .select('symbol, name, sector, exchange_id')
    .eq('exchange_id', exchangeId)
    .eq('active', true)
    .or(`symbol.ilike.%${q}%,name.ilike.%${q}%`)
    .limit(limit);

  if (error) throw error;
  const hits = (data || []).map((r) => ({
    symbol: r.symbol,
    name: r.name || r.symbol,
    sector: r.sector || '',
    exchange: code,
  }));

  if (hits.length) return hits;
  return code === 'PSX' ? searchLocalPsx(q, limit) : [];
}

async function resolveSymbolForExchange(query, exchangeCode) {
  const code = exchangeService.normalizeExchangeCode(exchangeCode);
  const q = String(query || '').trim();
  if (!q) return null;

  const sym = q.toUpperCase();
  const direct = await getStockDetail(code, sym);
  if (direct) return sym;

  const hits = await searchSecuritiesForExchange(q, code, 8);
  if (!hits.length) return null;
  if (hits.length === 1) return hits[0].symbol;

  const qLower = q.toLowerCase();
  const ranked = hits
    .map((h) => ({ ...h, score: scoreSymbolMatch(qLower, h) }))
    .sort((a, b) => b.score - a.score);
  if (ranked[0].score >= 40) return ranked[0].symbol;
  return ranked[0].symbol;
}

async function getPsxStockDetailFromLocal(sym) {
  const psx = await getClosingPrices('PSX');
  const row = (psx.rows || []).find((r) => r.symbol.toUpperCase() === sym);
  if (!row) return null;

  const index = await loadPsxSymbolIndex();
  const meta = index.find((e) => e.symbol === sym);

  let calendar = [];
  let profile = null;
  try {
    const calRows = await dataStore.readMarketData('dividends/psx_dividend_calendar.csv', async (fp) => {
      const csv = require('csv-parser');
      const fs = require('fs');
      return new Promise((resolve, reject) => {
        if (!fs.existsSync(fp)) return resolve([]);
        const results = [];
        fs.createReadStream(fp)
          .pipe(csv())
          .on('data', (d) => results.push(d))
          .on('end', () => resolve(results))
          .on('error', reject);
      });
    });
    const cal = (calRows.rows || []).find((r) => (r.Company || r.company || '').toUpperCase() === sym);
    if (cal) {
      calendar = [{
        dividend_per_share: parseFloat(cal.Dividend_per_share || cal.dividend_per_share) || null,
        payment_month: parseInt(cal.Payment_month || cal.payment_month, 10) || null,
        dividend_yield: parseFloat(cal.Dividend_yield || cal.dividend_yield) || null,
        price: parseFloat(cal.Price || cal.price) || null,
        year: parseInt(cal.Year || cal.year, 10) || null,
      }];
      profile = {
        dividend_yield: parseFloat(cal.Dividend_yield || cal.dividend_yield) || null,
        annual_rate: parseFloat(cal.Dividend_per_share || cal.dividend_per_share) || null,
      };
    }
  } catch (_) {
    /* optional csv enrichment */
  }

  return {
    exchange: 'PSX',
    symbol: sym,
    name: meta?.name || sym,
    sector: '',
    currency: 'PKR',
    price: {
      close: row.close,
      change: row.change,
      changePct: row.changePct,
      open: row.open,
      high: row.high,
      low: row.low,
      volume: row.volume,
      tradeDate: psx.date,
    },
    history: [],
    dividends: { calendar, payouts: [], events: [], profile },
    metrics: profile ? { dividend_yield: profile.dividend_yield } : null,
    news: [],
    aiInsight: null,
  };
}

async function getStockDetail(exchangeCode, symbol) {
  const code = exchangeService.normalizeExchangeCode(exchangeCode);
  const sym = exchangeService.normalizeListingSymbol(symbol, code);
  if (!sym) return null;

  if (code === 'PSX' && !isSupabaseConfigured()) {
    return getPsxStockDetailFromLocal(sym);
  }

  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabase();
  const exchangeId = await exchangeService.getExchangeId(code);
  if (!exchangeId) return null;

  const { data: sec } = await supabase
    .from('securities')
    .select('id, symbol, name, sector, industry')
    .eq('exchange_id', exchangeId)
    .eq('symbol', sym)
    .maybeSingle();

  let security = sec;
  if (!security && code === 'HKEX') {
    const alt = sym.replace(/^0+/, '') || sym;
    if (alt !== sym) {
      const { data: altSec } = await supabase
        .from('securities')
        .select('id, symbol, name, sector, industry')
        .eq('exchange_id', exchangeId)
        .eq('symbol', alt)
        .maybeSingle();
      security = altSec;
    }
  }
  if (!security) {
    if (code === 'PSX') return getPsxStockDetailFromLocal(sym);
    return null;
  }

  const [pricesRes, divCalRes, divPayRes, divEventsRes, divProfileRes, metricsRes, newsRes, insightRes] = await Promise.all([
    supabase
      .from('daily_prices')
      .select('trade_date, open, high, low, close, change_amount, change_pct, volume, currency')
      .eq('security_id', security.id)
      .order('trade_date', { ascending: false })
      .limit(90),
    supabase
      .from('dividend_calendar')
      .select('dividend_per_share, payment_month, dividend_yield, price, year')
      .eq('security_id', security.id)
      .order('year', { ascending: false })
      .limit(24),
    supabase
      .from('dividend_payouts')
      .select('dividend_announcement, announcement_date, payment_month, year')
      .eq('security_id', security.id)
      .order('year', { ascending: false })
      .limit(24),
    supabase
      .from('dividend_events')
      .select('ex_date, payment_date, amount, currency, frequency, dividend_type')
      .eq('security_id', security.id)
      .order('payment_date', { ascending: false })
      .limit(48),
    supabase
      .from('dividend_profiles')
      .select('annual_rate, dividend_yield, frequency, ex_dividend_date, trailing_12m_total, last_updated')
      .eq('security_id', security.id)
      .maybeSingle(),
    supabase
      .from('financial_metrics')
      .select('*')
      .eq('security_id', security.id)
      .order('as_of_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('news_articles')
      .select('headline, published_date, source, url')
      .eq('security_id', security.id)
      .order('published_date', { ascending: false })
      .limit(10),
    supabase
      .from('ai_insights')
      .select('content, confidence, insight_type, created_at')
      .eq('security_id', security.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const priceHistory = pricesRes.data || [];
  const latest = priceHistory[0];
  const derived = deriveSessionMove(priceHistory);
  const listingSymbol = exchangeService.normalizeListingSymbol(security.symbol, code);
  const cfg = exchangeService.getExchangeConfig(code);

  return {
    exchange: code,
    symbol: listingSymbol,
    name: security.name || listingSymbol,
    sector: security.sector || '',
    industry: security.industry || '',
    currency: latest?.currency || cfg.currency,
    price: latest
      ? {
          close: num(latest.close),
          change: derived.change,
          changePct: derived.changePct,
          open: num(latest.open),
          high: num(latest.high),
          low: num(latest.low),
          volume: latest.volume,
          tradeDate: latest.trade_date,
        }
      : null,
    history: (pricesRes.data || []).map((r) => ({
      date: r.trade_date,
      close: num(r.close),
      volume: r.volume,
    })),
    dividends: {
      calendar: divCalRes.data || [],
      payouts: divPayRes.data || [],
      events: divEventsRes.data || [],
      profile: divProfileRes.data || null,
    },
    metrics: metricsRes.data || null,
    news: newsRes.data || [],
    aiInsight: insightRes.data || null,
  };
}

function isDividendPayerProfile(profile) {
  return (
    num(profile?.annual_rate) > 0 ||
    num(profile?.dividend_yield) > 0 ||
    num(profile?.trailing_12m_total) > 0
  );
}

function paymentMonthFromDate(dateStr) {
  if (!dateStr) return null;
  const m = parseInt(String(dateStr).slice(5, 7), 10);
  return m >= 1 && m <= 12 ? m : null;
}

function calendarRowKey(symbol, year, month) {
  return `${symbol}:${year || ''}:${month || ''}`;
}

async function fetchPaginatedForExchange(supabase, table, exchangeId, select) {
  const pageSize = 1000;
  const all = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .eq('securities.exchange_id', exchangeId)
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const batch = data || [];
    all.push(...batch);
    if (batch.length < pageSize) break;
  }
  return all;
}

function mapCalendarRow(r, code) {
  return {
    symbol: r.securities.symbol,
    sector: r.securities.sector || '',
    paymentMonth: r.payment_month,
    yield: num(r.dividend_yield),
    dps: num(r.dividend_per_share),
    year: r.year,
    exchange: code,
    frequency: null,
  };
}

function profileToCalendarRow(profile, code) {
  const symbol = profile.securities?.symbol || '';
  if (!symbol) return null;
  const exMonth = paymentMonthFromDate(profile.ex_dividend_date);
  const year = profile.ex_dividend_date
    ? parseInt(String(profile.ex_dividend_date).slice(0, 4), 10)
    : new Date().getFullYear();
  let divYield = num(profile.dividend_yield);
  if (divYield != null && divYield > 0 && divYield < 1) divYield *= 100;
  return {
    symbol,
    sector: profile.securities?.sector || '',
    paymentMonth: exMonth,
    yield: divYield,
    dps: num(profile.annual_rate) || num(profile.trailing_12m_total),
    year,
    exchange: code,
    frequency: profile.frequency || null,
  };
}

function buildDividendSummary(rows) {
  const symbols = new Set();
  const monthSymbols = {};
  for (let i = 1; i <= 12; i += 1) monthSymbols[i] = new Set();

  for (const r of rows) {
    const sym = (r.symbol || '').trim();
    if (!sym) continue;
    symbols.add(sym);
    const m = parseInt(r.paymentMonth, 10);
    if (m >= 1 && m <= 12) monthSymbols[m].add(sym);
  }

  let busiestMonth = null;
  let busiestCount = 0;
  for (let i = 1; i <= 12; i += 1) {
    const c = monthSymbols[i].size;
    if (c > busiestCount) {
      busiestCount = c;
      busiestMonth = i;
    }
  }

  return {
    uniquePayers: symbols.size,
    totalRecords: rows.length,
    busiestMonth,
    busiestCount,
  };
}

async function getGlobalDividendsForExchange(code, filters = {}) {
  const exchangeId = await exchangeService.getExchangeId(code);
  if (!exchangeId) return { rows: [], summary: buildDividendSummary([]) };

  const supabase = getSupabase();
  const calendarSelect =
    'dividend_per_share, payment_month, dividend_yield, price, year, securities!inner(symbol, sector, exchange_id)';
  const profileSelect =
    'annual_rate, dividend_yield, frequency, ex_dividend_date, trailing_12m_total, securities!inner(symbol, sector, exchange_id)';
  const eventSelect =
    'payment_date, amount, securities!inner(symbol, sector, exchange_id)';

  const [calendarData, profileData, eventData] = await Promise.all([
    fetchPaginatedForExchange(supabase, 'dividend_calendar', exchangeId, calendarSelect),
    fetchPaginatedForExchange(supabase, 'dividend_profiles', exchangeId, profileSelect),
    fetchPaginatedForExchange(supabase, 'dividend_events', exchangeId, eventSelect),
  ]);

  const freqBySymbol = new Map(
    profileData.map((p) => [p.securities?.symbol || '', p.frequency || null])
  );

  const rowsByKey = new Map();
  const symbolsSeen = new Set();

  for (const r of calendarData) {
    const row = mapCalendarRow(r, code);
    row.frequency = freqBySymbol.get(row.symbol) || null;
    rowsByKey.set(calendarRowKey(row.symbol, row.year, row.paymentMonth), row);
    symbolsSeen.add(row.symbol);
  }

  for (const ev of eventData) {
    const symbol = ev.securities?.symbol || '';
    const dateStr = ev.payment_date;
    if (!symbol || !dateStr) continue;
    const year = parseInt(String(dateStr).slice(0, 4), 10);
    const month = paymentMonthFromDate(dateStr);
    if (!month) continue;
    const key = calendarRowKey(symbol, year, month);
    const amount = num(ev.amount) || 0;
    if (rowsByKey.has(key)) {
      const existing = rowsByKey.get(key);
      existing.dps = (existing.dps || 0) + amount;
      continue;
    }
    rowsByKey.set(key, {
      symbol,
      sector: ev.securities?.sector || '',
      paymentMonth: month,
      yield: null,
      dps: amount,
      year,
      exchange: code,
      frequency: freqBySymbol.get(symbol) || null,
    });
    symbolsSeen.add(symbol);
  }

  for (const profile of profileData) {
    if (!isDividendPayerProfile(profile)) continue;
    const symbol = profile.securities?.symbol || '';
    if (!symbol || symbolsSeen.has(symbol)) continue;
    const row = profileToCalendarRow(profile, code);
    if (!row) continue;
    const key = calendarRowKey(row.symbol, row.year, row.paymentMonth);
    if (rowsByKey.has(key)) continue;
    rowsByKey.set(key, row);
    symbolsSeen.add(symbol);
  }

  let merged = [...rowsByKey.values()];
  let preview = false;

  if (!merged.length) {
    const { fetchSeedDividendRows } = require('./exchangeNews');
    const seedRows = await fetchSeedDividendRows(code);
    if (seedRows.length) {
      merged = seedRows;
      preview = true;
    }
  }

  const filtered = applyDividendFilters(merged, filters);
  return { rows: filtered, summary: buildDividendSummary(merged), preview };
}

async function getDividendsForExchange(exchangeCode, filters = {}) {
  const code = exchangeService.normalizeExchangeCode(exchangeCode);

  if (code === 'PSX') {
    const { rows } = await dataStore.readMarketData('dividends/psx_dividend_calendar.csv', async (fp) => {
      const csv = require('csv-parser');
      const fs = require('fs');
      return new Promise((resolve, reject) => {
        if (!fs.existsSync(fp)) return resolve([]);
        const results = [];
        fs.createReadStream(fp)
          .pipe(csv())
          .on('data', (d) => results.push(d))
          .on('end', () => resolve(results))
          .on('error', reject);
      });
    });
    const mapped = (rows || []).map((r) => ({
      symbol: r.Company || r.company,
      sector: r.Sector || '',
      paymentMonth: parseInt(r.Payment_month, 10) || null,
      yield: parseFloat(r.Dividend_yield) || null,
      dps: parseFloat(r.Dividend_per_share) || null,
      year: parseInt(r.Year, 10) || null,
      exchange: 'PSX',
    }));
    return applyDividendFilters(mapped, filters);
  }

  if (!isSupabaseConfigured()) return { rows: [], summary: buildDividendSummary([]) };
  return getGlobalDividendsForExchange(code, filters);
}

function applyDividendFilters(rows, filters) {
  let out = rows;
  if (filters.month) {
    const m = parseInt(filters.month, 10);
    out = out.filter((r) => r.paymentMonth === m);
  }
  if (filters.sector) {
    const s = String(filters.sector).toLowerCase();
    out = out.filter((r) => (r.sector || '').toLowerCase().includes(s));
  }
  if (filters.minYield) {
    const y = parseFloat(filters.minYield);
    out = out.filter((r) => r.yield != null && r.yield >= y);
  }
  return out;
}

async function retrieveForAi(exchangeCode, symbol, question, holdings) {
  const { retrieveEnhanced } = require('./aiPipeline');
  const retrieval = await retrieveEnhanced(exchangeCode, symbol, question, holdings);
  return retrieval;
}

module.exports = {
  getClosingPrices,
  searchSecurities,
  searchSecuritiesForExchange,
  resolveSymbolForExchange,
  getStockDetail,
  getDividendsForExchange,
  retrieveForAi,
};
