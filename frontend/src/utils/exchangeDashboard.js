/** Normalize v1 dividend rows to legacy dashboard shape */
export function normalizeDividendRows(rows = [], exchange = 'PSX') {
  return rows.map((r) => ({
    Company: r.symbol || r.Company || r.company,
    CompanyName: r.name || r.CompanyName || '',
    Sector: r.sector || r.Sector || '',
    Dividend_yield: r.yield ?? r.Dividend_yield ?? r.dividend_yield,
    Dividend_per_share: r.dps ?? r.Dividend_per_share,
    Payment_month: r.paymentMonth ?? r.Payment_month ?? r.payment_month,
    Year: r.year ?? r.Year,
    exchange,
  }));
}

export function buildMonthCoverageFromDividends(dividends = []) {
  const monthCoverage = {};
  const monthSymbols = {};
  for (let i = 1; i <= 12; i += 1) {
    monthSymbols[i] = new Set();
  }
  dividends.forEach((d) => {
    const m = parseInt(d.Payment_month ?? d.payment_month ?? d.paymentMonth, 10);
    const sym = (d.Company || d.company || d.symbol || '').trim();
    if (!m || m < 1 || m > 12 || !sym) return;
    monthSymbols[m].add(sym);
  });
  let totalUnique = 0;
  for (let i = 1; i <= 12; i += 1) {
    const companies = [...monthSymbols[i]];
    monthCoverage[i] = { count: companies.length, companies };
    totalUnique += companies.length;
  }
  const avg = totalUnique / 12;
  const weakMonths = Object.entries(monthCoverage)
    .filter(([, v]) => v.count > 0 && v.count < avg * 0.5)
    .map(([month, v]) => ({ month: parseInt(month, 10), count: v.count }));
  return { monthCoverage, weakMonths, dividends };
}

export function buildMoversFromClosingPrices(payload = {}) {
  const rows = payload.rows || [];
  return rows
    .filter((r) => r.symbol && r.changePct != null && r.changePct !== 0)
    .map((r) => ({
      Company: r.symbol,
      ChangePct: r.changePct,
      Price: r.close,
      Date: payload.date || r.tradeDate,
    }))
    .sort((a, b) => Math.abs(b.ChangePct) - Math.abs(a.ChangePct));
}

export function buildGlobalMarketAlerts(movers = [], exchangeConfig) {
  return movers.slice(0, 6).map((m) => ({
    company: m.Company,
    kind: 'mover',
    level: Math.abs(m.ChangePct) >= 3 ? 'Elevated' : 'Moderate',
    headline: `${m.Company} moved ${m.ChangePct > 0 ? '+' : ''}${Number(m.ChangePct).toFixed(2)}% on latest ${exchangeConfig?.code || ''} close`,
    message: `Latest archived close for ${m.Company} on ${exchangeConfig?.name || 'this exchange'}. Research only — not a trading signal.`,
    priceMovePct: m.ChangePct,
    source: `${exchangeConfig?.code || 'Market'} database`,
    newsDate: m.Date,
    url: null,
  }));
}
