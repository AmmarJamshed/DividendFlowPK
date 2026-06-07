const globalDataStore = require('./globalDataStore');
const exchangeService = require('./exchangeService');
const { INVESTMENT_DISCLAIMER } = require('../constants/disclaimer');

function formatToolsBlock(retrieval) {
  const lines = [`Exchange: ${retrieval.exchange}`];
  if (retrieval.symbol) lines.push(`Symbol: ${retrieval.symbol}`);

  const { tools } = retrieval;
  if (tools.prices?.topMovers) {
    lines.push('Recent movers:');
    for (const r of tools.prices.topMovers.slice(0, 10)) {
      lines.push(`  ${r.symbol} close=${r.close} chg=${r.changePct}%`);
    }
  } else if (tools.prices) {
    const p = tools.prices;
    lines.push(`Latest price: close=${p.close} change=${p.changePct}% date=${p.tradeDate || 'n/a'}`);
  }

  if (tools.metrics) {
    const m = tools.metrics;
    lines.push(
      `Metrics: PE=${m.pe_ratio ?? 'n/a'} EPS=${m.eps ?? 'n/a'} divYield=${m.dividend_yield ?? 'n/a'} 52w=${m.week_52_low}-${m.week_52_high}`
    );
  }

  if (tools.dividends?.calendar?.length) {
    lines.push('Dividend calendar entries:');
    for (const d of tools.dividends.calendar.slice(0, 5)) {
      lines.push(`  month=${d.payment_month} yield=${d.dividend_yield} year=${d.year}`);
    }
  } else if (Array.isArray(tools.dividends) && tools.dividends.length) {
    lines.push(`Dividend rows: ${tools.dividends.length}`);
  }

  if (tools.news?.length) {
    lines.push('News headlines:');
    for (const n of tools.news.slice(0, 5)) {
      lines.push(`  - ${n.headline}`);
    }
  }

  if (!lines.length) lines.push('No structured DB data retrieved for this query.');
  return lines.join('\n');
}

function buildEnhancedSystemPrompt(exchangeCode, legacyDigest) {
  const cfg = exchangeService.getExchangeConfig(exchangeCode);
  return `You are "Market Buddy" on DividendFlow — a multi-exchange dividend and market research helper.

Active exchange context: ${cfg.name} (${cfg.code}), currency ${cfg.currency}.

Tone: clear, concise, professional. Short bullets when listing movers.

Rules you MUST follow:
1) ONLY use facts in the DATA blocks below. Never invent tickers, prices, or headlines.
2) Use probabilistic language ("may", "could", "historically") — never guaranteed returns or explicit buy/sell orders.
3) You are not a licensed adviser; no personalized portfolio or tax guidance.
4) If data is missing, say "unavailable in our database" — do not guess.
5) End with a confidence score line: "Confidence: NN/100" where NN reflects how complete the retrieved data is (0-100).
6) Include 1-3 bullet risks when discussing a company or sector.

Data freshness (file/DB — not live market data):
${legacyDigest || 'See structured retrieval block.'}

End every reply with: "Remember: ${INVESTMENT_DISCLAIMER.slice(0, 120)}..."`;
}

function buildUserBlock(retrieval, message, legacyDataBlock) {
  const structured = formatToolsBlock(retrieval);
  return `STRUCTURED DATABASE RETRIEVAL:
---
${structured}
---

LEGACY SCRAPE DATA (may supplement PSX):
---
${legacyDataBlock || '(none)'}
---

USER QUESTION:
${message}`;
}

function estimateConfidence(retrieval) {
  let score = 30;
  const { tools } = retrieval;
  if (tools.prices) score += 25;
  if (tools.dividends && (tools.dividends.calendar?.length || tools.dividends.length)) score += 20;
  if (tools.metrics) score += 15;
  if (tools.news?.length) score += 10;
  return Math.min(100, score);
}

async function prepareMarketChatContext({ message, exchange, symbol, legacyDigest, legacyDataBlock }) {
  const exchangeCode = exchangeService.normalizeExchangeCode(exchange);
  let detectedSymbol = symbol;

  if (!detectedSymbol && message) {
    const tokens = message.toUpperCase().match(/\b[A-Z]{1,5}\b/g);
    if (tokens?.length === 1) detectedSymbol = tokens[0];
  }

  const retrieval = await globalDataStore.retrieveForAi(exchangeCode, detectedSymbol, message);
  const systemPrompt = buildEnhancedSystemPrompt(exchangeCode, legacyDigest);
  const userBlock = buildUserBlock(retrieval, message, legacyDataBlock);
  const confidenceHint = estimateConfidence(retrieval);

  return { systemPrompt, userBlock, retrieval, confidenceHint, exchange: exchangeCode };
}

module.exports = {
  prepareMarketChatContext,
  formatToolsBlock,
  estimateConfidence,
};
