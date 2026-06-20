const axios = require('axios');
const exchangeService = require('./exchangeService');
const globalDataStore = require('./globalDataStore');
const dataStore = require('./dataStore');
const { getSupabase, isSupabaseConfigured } = require('../db/supabaseClient');

const YAHOO_UA = 'Mozilla/5.0 (compatible; DividendFlow/1.0)';

function getSeeds(exchangeCode) {
  const cfg = exchangeService.getExchangeConfig(exchangeCode);
  return cfg?.newsSeedSymbols || [];
}

function getMacroQuery(exchangeCode) {
  const cfg = exchangeService.getExchangeConfig(exchangeCode);
  return cfg?.macroNewsQuery || `${exchangeCode} stock market`;
}

function dbSymbolFromYahoo(yahooTicker, exchangeCode) {
  const cfg = exchangeService.getExchangeConfig(exchangeCode);
  const suffix = (cfg.yfinanceSuffix || '').toUpperCase();
  let s = String(yahooTicker || '').toUpperCase();
  if (suffix && s.endsWith(suffix)) s = s.slice(0, -suffix.length);
  return exchangeService.normalizeListingSymbol(s, exchangeCode);
}

async function fetchYahooNewsForQuery(query) {
  if (!query) return [];
  try {
    const { data } = await axios.get('https://query2.finance.yahoo.com/v1/finance/search', {
      params: { q: query, quotesCount: 0, newsCount: 8 },
      headers: { 'User-Agent': YAHOO_UA },
      timeout: 12000,
    });
    return (data?.news || [])
      .map((n) => ({
        Headline: n.title || '',
        Date: n.providerPublishTime ? new Date(n.providerPublishTime * 1000).toISOString() : '',
        Source: n.publisher || 'Yahoo Finance',
        Url: n.link || '',
      }))
      .filter((n) => n.Headline);
  } catch (err) {
    console.warn('[exchangeNews] Yahoo search failed:', query, err.message);
    return [];
  }
}

async function fetchYahooNewsForSymbol(symbol, exchangeCode) {
  const ticker = exchangeService.yfinanceTicker(symbol, exchangeCode);
  const items = await fetchYahooNewsForQuery(ticker);
  const company = String(symbol).toUpperCase();
  return items.map((n) => ({ ...n, Company: company }));
}

async function fetchYahooNewsBatch(exchangeCode, symbols, limit = 14) {
  const out = [];
  const slice = [...new Set(symbols.map((s) => String(s).toUpperCase()))].slice(0, limit);
  for (const sym of slice) {
    const rows = await fetchYahooNewsForSymbol(sym, exchangeCode);
    out.push(...rows.slice(0, 2));
    await new Promise((r) => setTimeout(r, 100));
  }
  return out;
}

async function fetchYahooChartMover(symbol, exchangeCode) {
  const ticker = exchangeService.yfinanceTicker(symbol, exchangeCode);
  try {
    const { data } = await axios.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`,
      {
        params: { interval: '1d', range: '5d' },
        headers: { 'User-Agent': YAHOO_UA },
        timeout: 12000,
      }
    );
    const result = data?.chart?.result?.[0];
    const closes = (result?.indicators?.quote?.[0]?.close || []).filter((v) => v != null);
    if (closes.length < 2) return null;
    const prev = closes[closes.length - 2];
    const last = closes[closes.length - 1];
    if (!prev || !last) return null;
    const changePct = ((last - prev) / prev) * 100;
    const tradeDate = result?.timestamp?.length
      ? new Date(result.timestamp[result.timestamp.length - 1] * 1000).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    return {
      Company: dbSymbolFromYahoo(result?.meta?.symbol || symbol, exchangeCode),
      Price: last,
      Change: last - prev,
      ChangePct: changePct,
      Date: tradeDate,
    };
  } catch (err) {
    console.warn('[exchangeNews] Yahoo chart failed:', ticker, err.message);
    return null;
  }
}

async function fetchMoversFromSeeds(exchangeCode) {
  const seeds = getSeeds(exchangeCode);
  if (!seeds.length) return [];
  const movers = [];
  for (const sym of seeds) {
    const row = await fetchYahooChartMover(sym, exchangeCode);
    if (row && row.ChangePct !== 0) movers.push(row);
    await new Promise((r) => setTimeout(r, 80));
  }
  return movers.sort((a, b) => Math.abs(b.ChangePct) - Math.abs(a.ChangePct));
}

async function fetchSeedClosingRows(exchangeCode) {
  const code = exchangeService.normalizeExchangeCode(exchangeCode);
  const cfg = exchangeService.getExchangeConfig(code);
  const seeds = getSeeds(code);
  const rows = [];
  for (const sym of seeds) {
    const m = await fetchYahooChartMover(sym, code);
    if (!m || m.Price == null) continue;
    rows.push({
      symbol: m.Company,
      company: m.Company,
      sector: '',
      close: m.Price,
      change: m.Change,
      changePct: m.ChangePct,
      volume: 0,
      currency: cfg.currency,
      exchange: code,
      tradeDate: m.Date,
    });
    await new Promise((r) => setTimeout(r, 60));
  }
  return rows.sort((a, b) => Math.abs(b.changePct || 0) - Math.abs(a.changePct || 0));
}

async function fetchExchangeMacroArticle(exchangeCode) {
  const code = exchangeService.normalizeExchangeCode(exchangeCode);
  const items = await fetchYahooNewsForQuery(getMacroQuery(code));
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
    .limit(400);
  return (data || [])
    .filter((r) => symSet.has(r.company_symbol))
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
    .limit(300);
  return (data || [])
    .filter((r) => symSet.has(r.company_symbol))
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

async function resolvePriceChanges(exchangeCode, market) {
  let priceChanges = priceChangesFromMarket(market);
  if (priceChanges.length) return { priceChanges, source: market.source || 'database' };

  const seedMovers = await fetchMoversFromSeeds(exchangeCode);
  if (seedMovers.length) {
    return { priceChanges: seedMovers, source: 'yahoo_seeds' };
  }
  return { priceChanges: [], source: 'none' };
}

async function getPsxDailyNewsFromStore() {
  const readCsv = async (rel) => {
    const result = await dataStore.readMarketData(rel, async (fp) => {
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
    return result?.rows || [];
  };

  const [news, commentary, priceCommentary, priceChangesRaw, dbNews] = await Promise.all([
    readCsv('news/daily_news.csv'),
    readCsv('news/ai_commentary.csv'),
    readCsv('news/price_commentary.csv'),
    readCsv('prices/price_changes.csv'),
    fetchSupabaseNewsForExchange('PSX'),
  ]);

  let priceChanges = (priceChangesRaw || [])
    .filter((p) => (p.Company || p.company) && (p.ChangePct != null || p.changePct != null))
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
  if (!priceChanges.some((p) => p.ChangePct !== 0)) {
    const seedMovers = await fetchMoversFromSeeds('PSX');
    if (seedMovers.length) priceChanges = seedMovers;
  }

  const mergedNews = [...(news || []), ...dbNews];
  const macro = await fetchExchangeMacroArticle('PSX');
  if (macro) mergedNews.push(macro);

  return {
    exchange: 'PSX',
    news: mergedNews,
    commentary: commentary || [],
    priceChanges,
    priceCommentary: priceCommentary || [],
    tradeDate: priceChanges[0]?.Date || null,
    dataSource: 'psx_scrape',
  };
}

async function getGlobalDailyNews(exchangeCode) {
  const code = exchangeService.normalizeExchangeCode(exchangeCode);
  const market = await globalDataStore.getClosingPrices(code);
  const { priceChanges, source: moverSource } = await resolvePriceChanges(code, market);

  const [dbNews, dbCommentary, dbPriceCommentary] = await Promise.all([
    fetchSupabaseNewsForExchange(code),
    fetchSupabaseCommentaryForExchange(code),
    fetchSupabasePriceCommentaryForExchange(code),
  ]);

  const moverSymbols = priceChanges.slice(0, 15).map((p) => p.Company);
  const seedSymbols = getSeeds(code);
  const newsSymbols = [...new Set([...moverSymbols, ...seedSymbols])];

  const yahooNews = newsSymbols.length ? await fetchYahooNewsBatch(code, newsSymbols, 14) : [];
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
    dataSource: moverSource,
  };
}

async function getDailyNewsForExchange(exchangeCode) {
  const code = exchangeService.normalizeExchangeCode(exchangeCode);
  const supported = exchangeService.listExchanges().map((e) => e.code);
  if (!supported.includes(code)) {
    throw new Error(`Unsupported exchange: ${exchangeCode}`);
  }
  if (code === 'PSX') return getPsxDailyNewsFromStore();
  return getGlobalDailyNews(code);
}

function listSupportedExchanges() {
  return exchangeService.listExchanges().map((e) => ({
    code: e.code,
    name: e.name,
    macroNewsQuery: e.macroNewsQuery,
    seedCount: (e.newsSeedSymbols || []).length,
  }));
}

module.exports = {
  getDailyNewsForExchange,
  listSupportedExchanges,
  fetchSeedClosingRows,
};
