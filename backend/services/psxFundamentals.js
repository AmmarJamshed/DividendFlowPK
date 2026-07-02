const { getSupabase, isSupabaseConfigured } = require('../db/supabaseClient');
const exchangeService = require('./exchangeService');

async function loadDividendYields() {
  const dataStore = require('./dataStore');
  const { rows } = await dataStore.readMarketData('dividends/psx_dividend_calendar.csv', async (fp) => {
    const csv = require('csv-parser');
    const fs = require('fs');
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(fp)) return resolve([]);
      const out = [];
      fs.createReadStream(fp)
        .pipe(csv())
        .on('data', (d) => out.push(d))
        .on('end', () => resolve(out))
        .on('error', reject);
    });
  });

  const map = new Map();
  for (const d of rows || []) {
    const sym = String(d.Company || d.company || '').toUpperCase().trim();
    const y = parseFloat(d.Dividend_yield || d.dividend_yield);
    if (!sym || !(y > 0)) continue;
    if (!map.has(sym)) map.set(sym, y);
  }
  return map;
}

async function loadFinancialMetrics() {
  const map = new Map();
  if (!isSupabaseConfigured()) return map;

  try {
    const supabase = getSupabase();
    const exchangeId = await exchangeService.getExchangeId('PSX');
    if (!exchangeId) return map;

    const { data: secs } = await supabase
      .from('securities')
      .select('id, symbol')
      .eq('exchange_id', exchangeId)
      .eq('active', true);
    if (!secs?.length) return map;

    const secById = new Map(secs.map((s) => [s.id, s.symbol]));
    const ids = secs.map((s) => s.id);
    const chunk = 200;
    for (let i = 0; i < ids.length; i += chunk) {
      const slice = ids.slice(i, i + chunk);
      const { data } = await supabase
        .from('financial_metrics')
        .select('security_id, market_cap, pe_ratio, dividend_yield, as_of_date')
        .in('security_id', slice)
        .order('as_of_date', { ascending: false });
      for (const row of data || []) {
        const sym = secById.get(row.security_id);
        if (!sym || map.has(sym)) continue;
        map.set(sym, {
          marketCap: row.market_cap != null ? Number(row.market_cap) : null,
          peRatio: row.pe_ratio != null ? Number(row.pe_ratio) : null,
          dividendYield: row.dividend_yield != null ? Number(row.dividend_yield) : null,
        });
      }
    }
  } catch (err) {
    console.warn('[psxFundamentals] metrics load failed:', err.message);
  }
  return map;
}

async function enrichPsxClosingFundamentals(rows) {
  const [yieldMap, metricsMap] = await Promise.all([loadDividendYields(), loadFinancialMetrics()]);

  return (rows || []).map((row) => {
    const sym = String(row.symbol || '').toUpperCase();
    const metrics = metricsMap.get(sym);
    const calendarYield = yieldMap.get(sym);
    return {
      ...row,
      dividendYield: metrics?.dividendYield ?? calendarYield ?? row.dividendYield ?? null,
      peRatio: metrics?.peRatio ?? row.peRatio ?? null,
      marketCap: metrics?.marketCap ?? row.marketCap ?? null,
    };
  });
}

module.exports = { enrichPsxClosingFundamentals };
