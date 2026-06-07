const { getSupabase, isSupabaseConfigured } = require('../db/supabaseClient');
const exchangeService = require('./exchangeService');

const POSITIVE = /\b(growth|gain|strong|beat|upgrade|bullish|positive|surge|rally|record|profit|expansion|outperform)\b/i;
const NEGATIVE = /\b(loss|decline|weak|cut|downgrade|bearish|negative|fall|drop|stress|risk|concern|lawsuit|default)\b/i;

async function fetchDbSentiment(exchangeCode) {
  const code = exchangeService.normalizeExchangeCode(exchangeCode);
  const result = {
    exchange: code,
    headlines: [],
    commentary: [],
    priceSignals: [],
    aggregate: { bullish: 0, bearish: 0, neutral: 0 },
  };

  if (!isSupabaseConfigured()) return result;

  const supabase = getSupabase();
  const exchangeId = await exchangeService.getExchangeId(code);
  if (!exchangeId) return result;

  const { data: secs } = await supabase
    .from('securities')
    .select('id, symbol')
    .eq('exchange_id', exchangeId)
    .limit(5000);
  const secIds = (secs || []).map((s) => s.id);
  const symSet = new Set((secs || []).map((s) => s.symbol));
  const symMap = new Map((secs || []).map((s) => [s.id, s.symbol]));
  if (!secIds.length) return result;

  const [newsRes, aiRes, priceRes] = await Promise.all([
    supabase
      .from('news_articles')
      .select('headline, company_symbol, security_id, published_date, source')
      .in('security_id', secIds.slice(0, 2000))
      .order('published_date', { ascending: false })
      .limit(40),
    supabase
      .from('news_ai_commentary')
      .select('company_symbol, commentary, commentary_date')
      .order('commentary_date', { ascending: false })
      .limit(50),
    supabase
      .from('news_price_commentary')
      .select('company_symbol, direction, change_pct, commentary, commentary_date')
      .order('commentary_date', { ascending: false })
      .limit(40),
  ]);

  const inUniverse = (sym) => !sym || symSet.has(sym) || code === 'PSX';

  for (const row of newsRes.data || []) {
    const sym = row.company_symbol || symMap.get(row.security_id) || '';
    if (!inUniverse(sym)) continue;
    const tone = scoreText(row.headline);
    result.headlines.push({ symbol: sym, headline: row.headline, tone, date: row.published_date });
    bumpAggregate(result.aggregate, tone);
  }

  for (const row of aiRes.data || []) {
    if (!inUniverse(row.company_symbol)) continue;
    const tone = scoreText(row.commentary);
    result.commentary.push({
      symbol: row.company_symbol,
      text: String(row.commentary).slice(0, 280),
      tone,
      date: row.commentary_date,
    });
    bumpAggregate(result.aggregate, tone);
  }

  for (const row of priceRes.data || []) {
    if (!inUniverse(row.company_symbol)) continue;
    const dir = (row.direction || '').toLowerCase();
    let tone = 'neutral';
    if (dir.includes('up') || dir.includes('gain') || (row.change_pct && row.change_pct > 0)) tone = 'bullish';
    if (dir.includes('down') || dir.includes('loss') || (row.change_pct && row.change_pct < 0)) tone = 'bearish';
    result.priceSignals.push({
      symbol: row.company_symbol,
      direction: row.direction,
      changePct: row.change_pct,
      tone,
      snippet: String(row.commentary || '').slice(0, 200),
    });
    bumpAggregate(result.aggregate, tone);
  }

  return result;
}

function scoreText(text) {
  const t = String(text || '');
  const p = (t.match(POSITIVE) || []).length;
  const n = (t.match(NEGATIVE) || []).length;
  if (p > n + 1) return 'bullish';
  if (n > p + 1) return 'bearish';
  return 'neutral';
}

function bumpAggregate(agg, tone) {
  if (tone === 'bullish') agg.bullish += 1;
  else if (tone === 'bearish') agg.bearish += 1;
  else agg.neutral += 1;
}

async function fetchTopDividendCandidates(exchangeCode, limit = 15) {
  const code = exchangeService.normalizeExchangeCode(exchangeCode);
  if (!isSupabaseConfigured()) return [];

  const supabase = getSupabase();
  const exchangeId = await exchangeService.getExchangeId(code);
  if (!exchangeId) return [];

  const { data: profiles } = await supabase
    .from('dividend_profiles')
    .select('dividend_yield, annual_rate, frequency, security_id, securities!inner(symbol, sector, name)')
    .eq('securities.exchange_id', exchangeId)
    .gt('dividend_yield', 0)
    .order('dividend_yield', { ascending: false })
    .limit(limit);

  return (profiles || []).map((p) => ({
    symbol: p.securities.symbol,
    name: p.securities.name,
    sector: p.securities.sector,
    yield: p.dividend_yield,
    annualRate: p.annual_rate,
    frequency: p.frequency,
  }));
}

async function fetchTopMoversFromDb(exchangeCode, limit = 12) {
  const market = await require('./globalDataStore').getClosingPrices(exchangeCode);
  const rows = market.rows || [];
  const gainers = [...rows].sort((a, b) => (b.changePct || 0) - (a.changePct || 0)).slice(0, limit);
  const losers = [...rows].sort((a, b) => (a.changePct || 0) - (b.changePct || 0)).slice(0, limit);
  return { gainers, losers, currency: market.currency };
}

async function analyzeHoldings(exchangeCode, holdings) {
  if (!holdings?.length) return null;
  const globalDataStore = require('./globalDataStore');
  const code = exchangeService.normalizeExchangeCode(exchangeCode);
  const analyzed = [];
  let totalYield = 0;
  let yieldCount = 0;

  for (const h of holdings.slice(0, 20)) {
    const sym = String(h.symbol || h.Symbol || '').toUpperCase();
    const shares = parseFloat(h.shares || h.Shares || 0) || 0;
    if (!sym) continue;
    const detail = await globalDataStore.getStockDetail(code, sym);
    if (!detail) {
      analyzed.push({ symbol: sym, shares, status: 'not_in_database' });
      continue;
    }
    const y = detail.metrics?.dividend_yield ?? detail.dividends?.profile?.dividend_yield;
    if (y != null) {
      totalYield += Number(y) < 1 ? Number(y) * 100 : Number(y);
      yieldCount += 1;
    }
    analyzed.push({
      symbol: sym,
      shares,
      sector: detail.sector,
      close: detail.price?.close,
      changePct: detail.price?.changePct,
      dividendYield: y,
      frequency: detail.dividends?.profile?.frequency,
      sentimentNotes: (detail.news || []).slice(0, 2).map((n) => n.headline),
    });
  }

  return {
    holdings: analyzed,
    avgIndicatedYield: yieldCount ? totalYield / yieldCount : null,
    count: analyzed.length,
  };
}

async function saveInsight(exchangeCode, symbol, content, confidence, insightType = 'market_chat') {
  if (!isSupabaseConfigured() || !content) return;
  try {
    const supabase = getSupabase();
    let securityId = null;
    if (symbol) {
      const exchangeId = await exchangeService.getExchangeId(exchangeCode);
      if (exchangeId) {
        const { data: sec } = await supabase
          .from('securities')
          .select('id')
          .eq('exchange_id', exchangeId)
          .eq('symbol', symbol.toUpperCase())
          .maybeSingle();
        securityId = sec?.id || null;
      }
    }
    await supabase.from('ai_insights').insert({
      security_id: securityId,
      exchange_code: exchangeCode,
      insight_type: insightType,
      content: String(content).slice(0, 4000),
      confidence: confidence ?? null,
      model: 'groq-market-buddy',
      valid_until: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    });
  } catch (err) {
    console.warn('[marketBuddyRag] insight save skipped:', err.message);
  }
}

module.exports = {
  fetchDbSentiment,
  fetchTopDividendCandidates,
  fetchTopMoversFromDb,
  analyzeHoldings,
  saveInsight,
  scoreText,
};
