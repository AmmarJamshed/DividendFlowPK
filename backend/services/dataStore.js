const fs = require('fs');
const path = require('path');
const { getSupabase, isSupabaseConfigured } = require('../db/supabaseClient');

const DEFAULT_EXCHANGE = 'PSX';
const DATA_PATH = path.join(__dirname, '..', '..', 'data');

/** Known CSV paths → Supabase loaders (return CSV-shaped rows). */
const DATA_KEYS = {
  'dividends/psx_dividend_calendar.csv': 'dividend_calendar',
  'dividends/psx_payouts.csv': 'dividend_payouts',
  'financials/psx_quarter_cycles.csv': 'quarter_cycles',
  'prices/psx_full_dataset.csv': 'psx_full_dataset',
  'prices/daily_prices.csv': 'price_history',
  'prices/price_changes.csv': 'price_changes',
  'news/daily_news.csv': 'daily_news',
  'news/ai_commentary.csv': 'ai_commentary',
  'news/price_commentary.csv': 'price_commentary',
};

let exchangeIdCache = null;
let securityIdCache = new Map();

function resolveDataPath(relativePath) {
  return path.join(DATA_PATH, ...relativePath.split('/'));
}

async function getPsxExchangeId(supabase) {
  if (exchangeIdCache) return exchangeIdCache;
  const { data, error } = await supabase
    .from('exchanges')
    .select('id')
    .eq('code', DEFAULT_EXCHANGE)
    .maybeSingle();
  if (error) throw error;
  exchangeIdCache = data?.id || null;
  return exchangeIdCache;
}

async function loadSecurityMap(supabase) {
  if (securityIdCache.size > 0) return securityIdCache;
  const exchangeId = await getPsxExchangeId(supabase);
  if (!exchangeId) return securityIdCache;
  const { data, error } = await supabase
    .from('securities')
    .select('id, symbol')
    .eq('exchange_id', exchangeId);
  if (error) throw error;
  for (const row of data || []) {
    securityIdCache.set(String(row.symbol).toUpperCase(), row.id);
  }
  return securityIdCache;
}

function parseNum(val) {
  if (val == null || val === '') return null;
  const v = String(val).replace(/,/g, '').replace('%', '').trim();
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchDividendCalendar(supabase) {
  const { data, error } = await supabase
    .from('dividend_calendar')
    .select(
      'dividend_per_share, payment_month, dividend_yield, price, year, securities!inner(symbol, sector, name)'
    )
    .order('year', { ascending: false });
  if (error) throw error;
  return (data || []).map((r) => ({
    Company: r.securities.symbol,
    company: r.securities.symbol,
    Sector: r.securities.sector || '',
    Dividend_per_share: r.dividend_per_share,
    Payment_month: r.payment_month,
    Dividend_yield: r.dividend_yield,
    Price: r.price,
    Year: r.year,
  }));
}

async function fetchDividendPayouts(supabase) {
  const { data, error } = await supabase
    .from('dividend_payouts')
    .select(
      'dividend_announcement, announcement_date, book_closure, book_closure_end, payment_month, year, securities!inner(symbol, name, sector)'
    )
    .order('year', { ascending: false });
  if (error) throw error;
  return (data || []).map((r) => ({
    Company: r.securities.symbol,
    company: r.securities.symbol,
    CompanyName: r.securities.name || '',
    Sector: r.securities.sector || '',
    Dividend_announcement: r.dividend_announcement || '',
    Announcement_date: r.announcement_date || '',
    Book_closure: r.book_closure || '',
    BookClosureEnd: r.book_closure_end || '',
    Payment_month: r.payment_month,
    Year: r.year,
  }));
}

async function fetchQuarterCycles(supabase) {
  const { data, error } = await supabase
    .from('quarter_cycles')
    .select(
      'fiscal_year_end, quarter_end_months, dividend_announcement_period, book_closure_month, estimated_payment_month, securities!inner(symbol, sector)'
    );
  if (error) throw error;
  return (data || []).map((r) => ({
    Company: r.securities.symbol,
    company: r.securities.symbol,
    Sector: r.securities.sector || '',
    Fiscal_Year_End: r.fiscal_year_end || '',
    Quarter_End_Months: r.quarter_end_months || '',
    Dividend_Announcement_Period: r.dividend_announcement_period || '',
    Book_Closure_Month: r.book_closure_month || '',
    Estimated_Payment_Month: r.estimated_payment_month || '',
  }));
}

async function fetchPsxFullDataset(supabase) {
  const { data, error } = await supabase
    .from('daily_prices')
    .select(
      'trade_date, open, high, low, close, ldcp, change_amount, change_pct, volume, securities!inner(symbol)'
    )
    .order('trade_date', { ascending: false })
    .limit(5000);
  if (error) throw error;

  const latestBySymbol = new Map();
  for (const r of data || []) {
    const sym = r.securities.symbol;
    if (!latestBySymbol.has(sym)) latestBySymbol.set(sym, r);
  }

  return [...latestBySymbol.values()].map((r) => ({
    date: r.trade_date,
    symbol: r.securities.symbol,
    ldcp: r.ldcp,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    change: r.change_amount,
    change_pct: r.change_pct != null ? `${r.change_pct}%` : '',
    volume: r.volume,
  }));
}

async function fetchPriceHistory(supabase) {
  const { data, error } = await supabase
    .from('price_history')
    .select('price_date, close_price, securities!inner(symbol)')
    .order('price_date', { ascending: false })
    .limit(10000);
  if (error) throw error;
  return (data || []).map((r) => ({
    Company: r.securities.symbol,
    Date: r.price_date,
    Price: r.close_price,
  }));
}

async function fetchPriceChanges(supabase) {
  const { data, error } = await supabase
    .from('price_changes')
    .select(
      'price, previous_price, change_amount, change_pct, change_date, securities!inner(symbol)'
    )
    .order('change_date', { ascending: false })
    .limit(2000);
  if (error) throw error;
  return (data || []).map((r) => ({
    Company: r.securities.symbol,
    Price: r.price,
    PreviousPrice: r.previous_price,
    Change: r.change_amount,
    ChangePct: r.change_pct,
    Date: r.change_date,
  }));
}

async function fetchDailyNews(supabase) {
  const { data, error } = await supabase
    .from('news_articles')
    .select('company_symbol, headline, published_date, source, url')
    .order('published_date', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data || []).map((r) => ({
    Company: r.company_symbol || 'PSX_MARKET',
    Headline: r.headline,
    Date: r.published_date,
    Source: r.source || '',
    Url: r.url || '',
  }));
}

async function fetchAiCommentary(supabase) {
  const { data, error } = await supabase
    .from('news_ai_commentary')
    .select('company_symbol, commentary, commentary_date')
    .order('commentary_date', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data || []).map((r) => ({
    Company: r.company_symbol,
    Commentary: r.commentary,
    Date: r.commentary_date,
  }));
}

async function fetchPriceCommentary(supabase) {
  const { data, error } = await supabase
    .from('news_price_commentary')
    .select('company_symbol, direction, change_pct, commentary, commentary_date')
    .order('commentary_date', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data || []).map((r) => ({
    Company: r.company_symbol,
    Direction: r.direction || '',
    ChangePct: r.change_pct,
    Commentary: r.commentary,
    Date: r.commentary_date,
  }));
}

async function fetchFromSupabase(relativePath) {
  const supabase = getSupabase();
  if (!supabase) return null;

  const key = DATA_KEYS[relativePath];
  if (!key) return null;

  try {
    switch (key) {
      case 'dividend_calendar':
        return await fetchDividendCalendar(supabase);
      case 'dividend_payouts':
        return await fetchDividendPayouts(supabase);
      case 'quarter_cycles':
        return await fetchQuarterCycles(supabase);
      case 'psx_full_dataset':
        return await fetchPsxFullDataset(supabase);
      case 'price_history':
        return await fetchPriceHistory(supabase);
      case 'price_changes':
        return await fetchPriceChanges(supabase);
      case 'daily_news':
        return await fetchDailyNews(supabase);
      case 'ai_commentary':
        return await fetchAiCommentary(supabase);
      case 'price_commentary':
        return await fetchPriceCommentary(supabase);
      default:
        return null;
    }
  } catch (err) {
    console.warn(`[dataStore] Supabase read failed for ${relativePath}:`, err.message);
    return null;
  }
}

/**
 * Read market data: Supabase first (when configured + populated), else CSV via readCSVFn.
 * @param {string} relativePath e.g. 'dividends/psx_dividend_calendar.csv'
 * @param {(filePath: string) => Promise<object[]>} readCSVFn
 */
async function readMarketData(relativePath, readCSVFn) {
  if (isSupabaseConfigured()) {
    const rows = await fetchFromSupabase(relativePath);
    if (rows && rows.length > 0) {
      return { rows, source: 'supabase' };
    }
  }
  const filePath = resolveDataPath(relativePath);
  const rows = await readCSVFn(filePath);
  return { rows, source: 'csv' };
}

async function getDataStatusExtra() {
  if (!isSupabaseConfigured()) {
    return {
      storage: 'csv',
      supabaseConfigured: false,
      marketCloseNotice: null,
    };
  }

  const supabase = getSupabase();
  let lastSync = null;
  let rowCounts = {};

  try {
    const { data: syncRows } = await supabase
      .from('data_sync_log')
      .select('synced_at, source_file, rows_processed, status')
      .order('synced_at', { ascending: false })
      .limit(1);
    if (syncRows?.[0]) lastSync = syncRows[0].synced_at;

    const tables = ['securities', 'daily_prices', 'dividend_calendar', 'dividend_payouts'];
    for (const table of tables) {
      const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
      rowCounts[table] = count ?? 0;
    }
  } catch (err) {
    console.warn('[dataStore] status check failed:', err.message);
  }

  const hasData = Object.values(rowCounts).some((n) => n > 0);

  return {
    storage: hasData ? 'supabase' : 'csv',
    supabaseConfigured: true,
    supabaseProject: process.env.SUPABASE_URL || null,
    lastSync,
    rowCounts,
    marketCloseNotice: hasData ? 'Based on latest available market close.' : null,
  };
}

async function checkSupabaseHealth() {
  if (!isSupabaseConfigured()) return { ok: false, reason: 'not_configured' };
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from('exchanges').select('code').limit(1);
    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

function clearCaches() {
  exchangeIdCache = null;
  securityIdCache = new Map();
}

module.exports = {
  readMarketData,
  getDataStatusExtra,
  checkSupabaseHealth,
  isSupabaseConfigured,
  clearCaches,
  DATA_PATH,
  DEFAULT_EXCHANGE,
};
