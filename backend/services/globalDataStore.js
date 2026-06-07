const { getSupabase, isSupabaseConfigured } = require('../db/supabaseClient');
const exchangeService = require('./exchangeService');
const dataStore = require('./dataStore');

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

  if (!isSupabaseConfigured()) return { exchange: code, rows: [], date: null, source: 'none' };

  const exchangeId = await exchangeService.getExchangeId(code);
  if (!exchangeId) return { exchange: code, rows: [], date: null, source: 'supabase' };

  const supabase = getSupabase();
  const { data: secs, error: secErr } = await supabase
    .from('securities')
    .select('id, symbol, name, sector')
    .eq('exchange_id', exchangeId)
    .eq('active', true);
  if (secErr) throw secErr;
  if (!secs?.length) return { exchange: code, rows: [], date: null, source: 'supabase' };

  const secMap = new Map(secs.map((s) => [s.id, s]));
  const secIds = secs.map((s) => s.id);

  const { data, error } = await supabase
    .from('daily_prices')
    .select('security_id, trade_date, open, high, low, close, change_amount, change_pct, volume, currency')
    .in('security_id', secIds)
    .order('trade_date', { ascending: false })
    .limit(8000);

  if (error) throw error;

  const latestBySymbol = new Map();
  for (const r of data || []) {
    const sec = secMap.get(r.security_id);
    if (!sec) continue;
    if (!latestBySymbol.has(sec.symbol)) latestBySymbol.set(sec.symbol, { ...r, securities: sec });
  }

  const cfg = exchangeService.getExchangeConfig(code);
  const rows = [...latestBySymbol.values()].map((r) => ({
    symbol: r.securities.symbol,
    company: r.securities.name || r.securities.symbol,
    sector: r.securities.sector || '',
    close: num(r.close),
    change: num(r.change_amount),
    changePct: num(r.change_pct),
    volume: r.volume || 0,
    open: num(r.open),
    high: num(r.high),
    low: num(r.low),
    currency: r.currency || cfg.currency,
    exchange: code,
  }));

  const date = rows[0] ? [...latestBySymbol.values()][0]?.trade_date : null;
  return { exchange: code, currency: cfg.currency, rows, date, source: 'supabase' };
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

async function searchSecurities(query, limit = 20) {
  const q = String(query || '').trim();
  if (!q || q.length < 1) return [];

  if (!isSupabaseConfigured()) {
    if (q.length >= 1) {
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
  return (data || []).map((r) => ({
    symbol: r.symbol,
    name: r.name || r.symbol,
    sector: r.sector || '',
    exchange: exchangeMap.get(r.exchange_id) || 'PSX',
  }));
}

async function getStockDetail(exchangeCode, symbol) {
  const code = exchangeService.normalizeExchangeCode(exchangeCode);
  const sym = String(symbol || '').toUpperCase().trim();
  if (!sym) return null;

  if (code === 'PSX' && !isSupabaseConfigured()) {
    const psx = await getClosingPrices('PSX');
    const row = (psx.rows || []).find((r) => r.symbol.toUpperCase() === sym);
    if (!row) return null;
    return {
      exchange: code,
      symbol: sym,
      name: row.company,
      price: row,
      history: [],
      dividends: [],
      metrics: null,
      news: [],
      aiInsight: null,
    };
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
  if (!sec) return null;

  const [pricesRes, divCalRes, divPayRes, metricsRes, newsRes, insightRes] = await Promise.all([
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
  return applyDividendFilters(mapped, filters);
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

async function retrieveForAi(exchangeCode, symbol, question) {
  const tools = { prices: null, dividends: null, news: null, metrics: null, forecast: null };
  const code = exchangeService.normalizeExchangeCode(exchangeCode || 'PSX');

  if (symbol) {
    const detail = await getStockDetail(code, symbol);
    if (detail) {
      tools.prices = detail.price;
      tools.dividends = detail.dividends;
      tools.news = detail.news?.slice(0, 5);
      tools.metrics = detail.metrics;
    }
  } else if (code === 'PSX') {
    const psx = await getClosingPrices('PSX');
    tools.prices = { topMovers: psx.rows?.slice(0, 15) };
  } else {
    const market = await getClosingPrices(code);
    tools.prices = { topMovers: market.rows?.slice(0, 15) };
  }

  const q = String(question || '').toLowerCase();
  if (q.includes('dividend') && !tools.dividends) {
    tools.dividends = await getDividendsForExchange(code, {});
  }

  return { exchange: code, symbol: symbol || null, tools };
}

module.exports = {
  getClosingPrices,
  searchSecurities,
  getStockDetail,
  getDividendsForExchange,
  retrieveForAi,
};
