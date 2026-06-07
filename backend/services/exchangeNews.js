const path = require('path');
const axios = require('axios');
const exchangeService = require('./exchangeService');
const globalDataStore = require('./globalDataStore');
const dataStore = require('./dataStore');
const { getSupabase, isSupabaseConfigured } = require('../db/supabaseClient');

const YAHOO_UA = 'Mozilla/5.0 (compatible; DividendFlow/1.0)';

function toYahooTicker(symbol, exchangeCode) {
  const cfg = exchangeService.getExchangeConfig(exchangeCode);
  const suffix = (cfg.yfinanceSuffix || '').toUpperCase();
  const s = String(symbol || '').trim().toUpperCase();
  if (!s) return '';
  if (suffix && !s.endsWith(suffix)) return `${s}${suffix}`;
  return s;
}

async function fetchYahooNewsForQuery(query) {
  if (!query) return [];
  try {
    const { data } = await axios.get('https://query2.finance.yahoo.com/v1/finance/search', {
      params: { q: query, quotesCount: 0, newsCount: 8 },
      headers: { 'User-Agent': YAHOO_UA },
      timeout: 12000,
    });
    return (data?.news || []).map((n) => ({
      Headline: n.title || '',
      Date: n.providerPublishTime ? new Date(n.providerPublishTime * 1000).toISOString() : '',
      Source: n.publisher || 'Yahoo Finance',
      Url: n.link || '',
    })).filter((n) => n.Headline);
  } catch (err) {
    console.warn('[exchangeNews] Yahoo search failed:', query, err.message);
    return [];
  }
}

async function fetchYahooNewsForSymbol(symbol, exchangeCode) {
  const ticker = toYahooTicker(symbol, exchangeCode);
  const items = await fetchYahooNewsForQuery(ticker);
  return items.map((n) => ({ ...n, Company: String(symbol).toUpperCase() }));
}

async function fetchYahooNewsBatch(exchangeCode, symbols, limit = 12) {
  const out = [];
  const slice = symbols.slice(0, limit);
  for (const sym of slice) {
    const rows = await fetchYahooNewsForSymbol(sym, exchangeCode);
    out.push(...rows.slice(0, 2));
    await new Promise((r) => setTimeout(r, 120));
  }
  return out;
}

const MACRO_QUERIES = {
  PSX: 'Pakistan stock exchange PSX',
  NYSE: 'NYSE stock market',
  NASDAQ: 'NASDAQ stocks',
  LSE: 'London stock exchange FTSE',
  HKEX: 'Hang Seng Hong Kong stocks',
  TSE: 'Nikkei Tokyo stocks',
  SSE: 'Shanghai stock exchange',
  TADAWUL: 'Tadawul Saudi stocks',
};

async function fetchExchangeMacroArticle(exchangeCode) {
  const code = exchangeService.normalizeExchangeCode(exchangeCode);
  const query = MACRO_QUERIES[code] || `${code} stock market`;
  const items = await fetchYahooNewsForQuery(query);
  if (!items.length) return null;
  const top = items[0];
  return {
    Company: `${code}_MARKET`,
    Headline: top.Headline,
    Date: top.Date,
    Source: top.Source,
    Url: top.Url,
  };
}

async function getExchangeSecuritySymbols(exchangeCode) {
  if (!isSupabaseConfigured()) return { secIds: [], symSet: new Set(), symMap: new Map() };
  const exchangeId = await exchangeService.getExchangeId(exchangeCode);
  if (!exchangeId) return { secIds: [], symSet: new Set(), symMap: new Map() };
  const supabase = getSupabase();
  const { data: secs } = await supabase.from('securities').select('id, symbol').eq('exchange_id', exchangeId);
  const symSet = new Set((secs || []).map((s) => s.symbol));
  const symMap = new Map((secs || []).map((s) => [s.id, s.symbol]));
  return { secIds: (secs || []).map((s) => s.id), symSet, symMap };
}

async function fetchSupabaseNewsForExchange(exchangeCode) {
  const { secIds, symMap } = await getExchangeSecuritySymbols(exchangeCode);
  if (!secIds.length || !isSupabaseConfigured()) return [];
  const supabase = getSupabase();
  const { data } = await supabase
    .from('news_articles')
    .select('headline, published_date, source, url, security_id, company_symbol')
    .in('security_id', secIds.slice(0, 4000))
    .order('published_date', { ascending: false })
    .limit(250);
  return (data || [])
    .map((r) => ({
      Company: (r.company_symbol || symMap.get(r.security_id) || '').toUpperCase(),
      Headline: r.headline,
      Date: r.published_date,
      Source: r.source || '',
      Url: r.url || '',
    }))
    .filter((n) => n.Company && n.Headline);
}

async function fetchSupabaseCommentaryForExchange(exchangeCode) {
  const { symSet } = await getExchangeSecuritySymbols(exchangeCode);
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabase();
  const { data } = await supabase
    .from('news_ai_commentary')
    .select('company_symbol, commentary, commentary_date')
    .order('commentary_date', { ascending: false })
    .limit(300);
  return (data || [])
    .filter((r) => symSet.has(r.company_symbol) || exchangeCode === 'PSX')
    .map((r) => ({
      Company: r.company_symbol,
      Commentary: r.commentary,
      Date: r.commentary_date,
    }));
}

async function fetchSupabasePriceCommentaryForExchange(exchangeCode) {
  const { symSet } = await getExchangeSecuritySymbols(exchangeCode);
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabase();
  const { data } = await supabase
    .from('news_price_commentary')
    .select('company_symbol, direction, change_pct, commentary, commentary_date')
    .order('commentary_date', { ascending: false })
    .limit(200);
  return (data || [])
    .filter((r) => symSet.has(r.company_symbol) || exchangeCode === 'PSX')
    .map((r) => ({
      Company: r.company_symbol,
      Direction: r.direction || '',
      ChangePct: r.change_pct,
      Commentary: r.commentary,
      Date: r.commentary_date,
    }));
}

function priceChangesFromMarket(market) {
  return (market.rows || [])
    .filter((r) => r.symbol && r.changePct != null && r.changePct !== 0)
    .map((r) => ({
      Company: r.symbol,
      Price: r.close,
      Change: r.change,
      ChangePct: r.changePct,
      Date: market.date,
    }))
    .sort((a, b) => Math.abs(b.ChangePct) - Math.abs(a.ChangePct));
}

async function getPsxDailyNewsFromStore() {
  const readCsv = (rel) =>
    dataStore.readMarketData(rel, async (fp) => {
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

  const [news, commentary, priceCommentary, priceChangesRaw] = await Promise.all([
    readCsv('news/daily_news.csv'),
    readCsv('news/ai_commentary.csv'),
    readCsv('news/price_commentary.csv'),
    readCsv('prices/price_changes.csv'),
  ]);

  let priceChanges = (priceChangesRaw || [])
    .filter((p) => (p.Company || p.company) && (p.ChangePct || p.changePct))
    .map((p) => ({
      Company: p.Company || p.company,
      Price: parseFloat(p.Price || p.price) || 0,
      Change: parseFloat(p.Change || p.change) || 0,
      ChangePct: parseFloat(p.ChangePct || p.changePct) || 0,
      Date: p.Date || p.date,
    }));

  if (!priceChanges.some((p) => p.ChangePct !== 0)) {
    const market = await globalDataStore.getClosingPrices('PSX');
    priceChanges = priceChangesFromMarket(market);
  }

  return {
    exchange: 'PSX',
    news: news || [],
    commentary: commentary || [],
    priceChanges,
    priceCommentary: priceCommentary || [],
    tradeDate: priceChanges[0]?.Date || null,
  };
}

async function getGlobalDailyNews(exchangeCode) {
  const code = exchangeService.normalizeExchangeCode(exchangeCode);
  const market = await globalDataStore.getClosingPrices(code);
  const priceChanges = priceChangesFromMarket(market);

  const [dbNews, dbCommentary, dbPriceCommentary] = await Promise.all([
    fetchSupabaseNewsForExchange(code),
    fetchSupabaseCommentaryForExchange(code),
    fetchSupabasePriceCommentaryForExchange(code),
  ]);

  const moverSymbols = priceChanges.slice(0, 15).map((p) => p.Company);
  const yahooNews = moverSymbols.length ? await fetchYahooNewsBatch(code, moverSymbols, 10) : [];
  const macro = await fetchExchangeMacroArticle(code);

  const newsByKey = new Map();
  for (const row of [...dbNews, ...yahooNews]) {
    const key = `${row.Company}:${row.Headline}`;
    if (!newsByKey.has(key)) newsByKey.set(key, row);
  }
  const news = [...newsByKey.values()];
  if (macro) news.push(macro);

  const commentary = dbCommentary.length
    ? dbCommentary
    : dbPriceCommentary.map((r) => ({
        Company: r.Company,
        Commentary: r.Commentary,
        Date: r.Date,
      }));

  return {
    exchange: code,
    news,
    commentary,
    priceChanges,
    priceCommentary: dbPriceCommentary,
    tradeDate: market.date || priceChanges[0]?.Date || null,
  };
}

async function getDailyNewsForExchange(exchangeCode) {
  const code = exchangeService.normalizeExchangeCode(exchangeCode);
  if (code === 'PSX') return getPsxDailyNewsFromStore();
  return getGlobalDailyNews(code);
}

module.exports = {
  getDailyNewsForExchange,
  toYahooTicker,
};
