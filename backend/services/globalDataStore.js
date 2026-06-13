const { getSupabase, isSupabaseConfigured } = require('../db/supabaseClient');
const exchangeService = require('./exchangeService');
const dataStore = require('./dataStore');
const { ensureExchangeUniverse, FULL_UNIVERSE } = require('./universeSync');

async function getClosingPrices(exchangeCode) {
  const code = exchangeService.normalizeExchangeCode(exchangeCode);

  if (code === 'PSX') {
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
    return formatPsxRows(rows, code);
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
  const { data: secs, error: secErr } = await supabase
    .from('securities')
    .select('id, symbol, name, sector')
    .eq('exchange_id', exchangeId)
    .eq('active', true)
    .order('symbol', { ascending: true })
    .limit(15000);
  if (secErr) throw secErr;

  if (!secs?.length) {
    const fallback = await fetchSeedClosingPrices(code);
    if (fallback.rows.length) return { ...fallback, universe: universeMeta };
    return { exchange: code, rows: [], date: null, source: 'supabase', universe: universeMeta };
  }

  const secMap = new Map(secs.map((s) => [s.id, s]));
  const secIds = secs.map((s) => s.id);
  const latestBySecId = await fetchLatestPricesBatched(supabase, secIds);

  const cfg = exchangeService.getExchangeConfig(code);
  let maxDate = null;
  const rows = [];
  for (const sec of secs) {
    const r = latestBySecId.get(sec.id);
    if (r?.trade_date && (!maxDate || r.trade_date > maxDate)) maxDate = r.trade_date;
    rows.push({
      symbol: sec.symbol,
      company: sec.name || sec.symbol,
      sector: sec.sector || '',
      close: r ? num(r.close) : null,
      change: r ? num(r.change_amount) : null,
      changePct: r ? num(r.change_pct) : null,
      volume: r?.volume || 0,
      open: r ? num(r.open) : null,
      high: r ? num(r.high) : null,
      low: r ? num(r.low) : null,
      currency: (r?.currency || cfg.currency),
      exchange: code,
      weekChgPct: null,
    });
  }

  const withPrices = rows.filter((row) => row.close != null).length;
  const date = maxDate;
  const payload = {
    exchange: code,
    currency: cfg.currency,
    rows,
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

async function fetchLatestPricesBatched(supabase, secIds) {
  const latestBySecId = new Map();
  for (let i = 0; i < secIds.length; i += SEC_ID_CHUNK) {
    const chunk = secIds.slice(i, i + SEC_ID_CHUNK);
    const { data, error } = await supabase
      .from('daily_prices')
      .select('security_id, trade_date, open, high, low, close, change_amount, change_pct, volume, currency')
      .in('security_id', chunk)
      .order('trade_date', { ascending: false })
      .limit(chunk.length * 4);
    if (error) throw error;
    for (const r of data || []) {
      if (!latestBySecId.has(r.security_id)) latestBySecId.set(r.security_id, r);
    }
  }
  return latestBySecId;
}

async function fetchSeedClosingPrices(exchangeCode) {
  const { fetchSeedClosingRows } = require('./exchangeNews');
  const code = exchangeService.normalizeExchangeCode(exchangeCode);
  const cfg = exchangeService.getExchangeConfig(code);
  const rows = await fetchSeedClosingRows(code);
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
      company: symbol,
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

  if (!isSupabaseConfigured()) {
    if (q.length >= 1) {
      const local = await searchLocalPsx(q, limit);
      if (local.length) return local;
      const psx = await getClosingPrices('PSX');
      return (psx.rows || [])
        .filter((r) => r.symbol.toUpperCase().includes(q.toUpperCase()) || r.company.toUpperCase().includes(q.toUpperCase()))
        .slice(0, limit)
        .map((r) => ({ symbol: r.symbol, name: r.company, exchange: 'PSX', sector: r.sector || '' }));
    }
    return [];
  }

  const supabase = getSupabase();
  const { data: exchanges } = await supabase.from('exchanges').select('id, code');
  const exchangeMap = new Map((exchanges || []).map((e) => [e.id, e.code]));

  const { data, error } = await supabase
    .from('securities')
    .select('symbol, name, sector, exchange_id')
    .or(`symbol.ilike.%${q}%,name.ilike.%${q}%`)
    .eq('active', true)
    .limit(limit);

  if (error) throw error;
  const remote = (data || []).map((r) => ({
    symbol: r.symbol,
    name: r.name || r.symbol,
    sector: r.sector || '',
    exchange: exchangeMap.get(r.exchange_id) || 'PSX',
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
  const sym = String(symbol || '').toUpperCase().trim();
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
  if (!sec) {
    if (code === 'PSX') return getPsxStockDetailFromLocal(sym);
    return null;
  }

  const [pricesRes, divCalRes, divPayRes, divEventsRes, divProfileRes, metricsRes, newsRes, insightRes] = await Promise.all([
    supabase
      .from('daily_prices')
      .select('trade_date, open, high, low, close, change_amount, change_pct, volume, currency')
      .eq('security_id', sec.id)
      .order('trade_date', { ascending: false })
      .limit(90),
    supabase
      .from('dividend_calendar')
      .select('dividend_per_share, payment_month, dividend_yield, price, year')
      .eq('security_id', sec.id)
      .order('year', { ascending: false })
      .limit(24),
    supabase
      .from('dividend_payouts')
      .select('dividend_announcement, announcement_date, payment_month, year')
      .eq('security_id', sec.id)
      .order('year', { ascending: false })
      .limit(24),
    supabase
      .from('dividend_events')
      .select('ex_date, payment_date, amount, currency, frequency, dividend_type')
      .eq('security_id', sec.id)
      .order('payment_date', { ascending: false })
      .limit(48),
    supabase
      .from('dividend_profiles')
      .select('annual_rate, dividend_yield, frequency, ex_dividend_date, trailing_12m_total, last_updated')
      .eq('security_id', sec.id)
      .maybeSingle(),
    supabase
      .from('financial_metrics')
      .select('*')
      .eq('security_id', sec.id)
      .order('as_of_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('news_articles')
      .select('headline, published_date, source, url')
      .eq('security_id', sec.id)
      .order('published_date', { ascending: false })
      .limit(10),
    supabase
      .from('ai_insights')
      .select('content, confidence, insight_type, created_at')
      .eq('security_id', sec.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const latest = pricesRes.data?.[0];
  const cfg = exchangeService.getExchangeConfig(code);

  return {
    exchange: code,
    symbol: sec.symbol,
    name: sec.name || sec.symbol,
    sector: sec.sector || '',
    industry: sec.industry || '',
    currency: latest?.currency || cfg.currency,
    price: latest
      ? {
          close: num(latest.close),
          change: num(latest.change_amount),
          changePct: num(latest.change_pct),
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
    return applyDividendFilters(
      (rows || []).map((r) => ({
        symbol: r.Company || r.company,
        sector: r.Sector || '',
        paymentMonth: parseInt(r.Payment_month, 10) || null,
        yield: parseFloat(r.Dividend_yield) || null,
        dps: parseFloat(r.Dividend_per_share) || null,
        year: parseInt(r.Year, 10) || null,
        exchange: 'PSX',
      })),
      filters
    );
  }

  if (!isSupabaseConfigured()) return [];
  const exchangeId = await exchangeService.getExchangeId(code);
  if (!exchangeId) return [];

  const supabase = getSupabase();
  const { data: secs } = await supabase.from('securities').select('id').eq('exchange_id', exchangeId);
  const secIds = (secs || []).map((s) => s.id);
  if (!secIds.length) return [];

  const { data, error } = await supabase
    .from('dividend_calendar')
    .select(
      'dividend_per_share, payment_month, dividend_yield, price, year, securities!inner(symbol, sector)'
    )
    .in('security_id', secIds);

  if (error) throw error;
  const mapped = (data || []).map((r) => ({
    symbol: r.securities.symbol,
    sector: r.securities.sector || '',
    paymentMonth: r.payment_month,
    yield: num(r.dividend_yield),
    dps: num(r.dividend_per_share),
    year: r.year,
    exchange: code,
  }));

  const { data: profiles } = await supabase
    .from('dividend_profiles')
    .select('frequency, dividend_yield, security_id, securities!inner(symbol)')
    .in('security_id', secIds);

  const freqBySymbol = new Map(
    (profiles || []).map((p) => [p.securities?.symbol || '', p.frequency])
  );

  const enriched = mapped.map((r) => ({
    ...r,
    frequency: freqBySymbol.get(r.symbol) || null,
  }));

  return applyDividendFilters(enriched, filters);
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
