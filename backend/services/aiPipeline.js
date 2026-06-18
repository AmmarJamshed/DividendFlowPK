const globalDataStore = require('./globalDataStore');
const exchangeService = require('./exchangeService');
const marketBuddyRag = require('./marketBuddyRag');
const { INVESTMENT_DISCLAIMER } = require('../constants/disclaimer');

const CHAT_STOP = new Set([
  'IS', 'IT', 'A', 'AN', 'THE', 'AND', 'OR', 'FOR', 'TO', 'IN', 'ON', 'AT', 'BY', 'AS', 'IF',
  'GOOD', 'BUY', 'SELL', 'BAD', 'NOW', 'MY', 'ME', 'I', 'YOU', 'WHAT', 'WHICH', 'HOW', 'WHY',
  'WHEN', 'WHERE', 'ARE', 'WAS', 'BE', 'DO', 'DOES', 'CAN', 'SHOULD', 'WORTH', 'STOCK', 'SHARE',
  'SHARES', 'PSX', 'NYSE', 'NASDAQ', 'HKEX', 'LSE', 'TSE', 'SSE', 'TADAWUL', 'ABOUT', 'TELL',
  'GIVE', 'SHOW', 'LIST', 'TOP', 'BEST', 'WELL', 'VERY', 'THIS', 'THAT', 'WITH', 'FROM', 'WILL',
  'NOT', 'ALL', 'ANY', 'SOME', 'MUCH', 'MORE', 'LIKE', 'JUST', 'THAN', 'THEN', 'THEM', 'THEY',
  'HAVE', 'HAS', 'HAD', 'BEEN', 'BEING', 'WOULD', 'COULD', 'MAY', 'MIGHT', 'MUST', 'NEED',
  'WANT', 'KNOW', 'THINK', 'SEE', 'GET', 'MAKE', 'TAKE', 'COME', 'FAIR', 'BETTER', 'WORSE',
  'IDEA', 'IDEAS', 'PICK', 'PICKS', 'ADD', 'HELP', 'PLEASE', 'HEY', 'HI', 'HELLO', 'OK', 'YES', 'NO',
]);

const COMPANY_ALIASES = {
  nestle: 'NESTLE',
  'nestle pakistan': 'NESTLE',
  engro: 'ENGRO',
  'engro fertilizer': 'EFERT',
  efert: 'EFERT',
  'habib bank': 'HBL',
  habib: 'HBL',
  hbl: 'HBL',
  mcb: 'MCB',
  'muslim commercial': 'MCB',
  ubl: 'UBL',
  'united bank': 'UBL',
  ogdc: 'OGDC',
  'oil and gas development': 'OGDC',
  ppl: 'PPL',
  'pakistan petroleum': 'PPL',
  pso: 'PSO',
  ffc: 'FFC',
  'fauji fertilizer': 'FFC',
  hubco: 'HUBC',
  hubc: 'HUBC',
  kapco: 'KAPCO',
  lucky: 'LUCK',
  luck: 'LUCK',
  colgate: 'COLG',
  colg: 'COLG',
  unity: 'UNITY',
  'systems limited': 'SYS',
  sys: 'SYS',
};

async function resolveSymbolFromMessage(message, exchangeCode) {
  const code = exchangeService.normalizeExchangeCode(exchangeCode);
  const msg = String(message || '').trim();
  if (!msg) return null;

  const lower = msg.toLowerCase().replace(/[^\w\s]/g, ' ');

  const aliasKeys = Object.keys(COMPANY_ALIASES).sort((a, b) => b.length - a.length);
  for (const key of aliasKeys) {
    if (lower.includes(key)) return COMPANY_ALIASES[key];
  }

  const upperTokens = msg.toUpperCase().match(/\b[A-Z]{2,6}\b/g) || [];
  const tickers = upperTokens.filter((t) => !CHAT_STOP.has(t));
  if (tickers.length === 1) return tickers[0];

  const words = lower.split(/\s+/).filter((w) => w.length >= 3 && !CHAT_STOP.has(w.toUpperCase()));
  const phrases = [];
  for (let len = Math.min(4, words.length); len >= 1; len -= 1) {
    for (let i = 0; i <= words.length - len; i += 1) {
      phrases.push(words.slice(i, i + len).join(' '));
    }
  }
  phrases.sort((a, b) => b.length - a.length);

  for (const phrase of phrases) {
    const resolved = await globalDataStore.resolveSymbolForExchange(phrase, code);
    if (resolved) return resolved;
  }

  if (tickers.length > 1) {
    for (const t of tickers) {
      const detail = await globalDataStore.getStockDetail(code, t);
      if (detail) return t;
    }
  }

  return null;
}

function classifyIntent(message) {
  const q = String(message || '').toLowerCase();
  if (/portfolio|holdings|allocat|diversif|what should i|invest \$|invest pk|invest usd|split|weight/.test(q)) {
    return 'portfolio_research';
  }
  if (/buy|purchase|pick|suggest|recommend|ideas|add to|worth buying/.test(q)) {
    return 'ideas_research';
  }
  if (/dividend|yield|income|payout|dps/.test(q)) return 'dividend_hunt';
  if (/sentiment|mood|bullish|bearish|news|headline|commentary|risk flag/.test(q)) {
    return 'sentiment';
  }
  if (/compare|versus|vs\b|better than/.test(q)) return 'compare';
  return 'general';
}

function formatSentimentBlock(sentiment) {
  if (!sentiment) return '(no sentiment scrape in database)';
  const lines = [
    `Aggregate scrape tone: bullish=${sentiment.aggregate.bullish} bearish=${sentiment.aggregate.bearish} neutral=${sentiment.aggregate.neutral}`,
  ];
  for (const c of (sentiment.commentary || []).slice(0, 8)) {
    lines.push(`[${c.tone}] ${c.symbol}: ${c.text}`);
  }
  for (const p of (sentiment.priceSignals || []).slice(0, 6)) {
    lines.push(`Price signal [${p.tone}] ${p.symbol} ${p.direction || ''} ${p.changePct ?? ''}% — ${p.snippet}`);
  }
  for (const h of (sentiment.headlines || []).slice(0, 8)) {
    lines.push(`News [${h.tone}] ${h.symbol}: ${h.headline}`);
  }
  return lines.join('\n');
}

function formatCandidates(candidates) {
  if (!candidates?.length) return '(no dividend candidates in database for this exchange)';
  return candidates
    .map(
      (c, i) =>
        `${i + 1}. ${c.symbol} (${c.sector || 'n/a'}) yield=${c.yield}% freq=${c.frequency || '?'} annual=${c.annualRate ?? 'n/a'}`
    )
    .join('\n');
}

function formatPortfolioBlock(portfolio) {
  if (!portfolio?.holdings?.length) return '(no holdings provided — ask user for tickers + share counts for tailored research)';
  const lines = [`Holdings analyzed: ${portfolio.count}, avg indicated yield=${portfolio.avgIndicatedYield?.toFixed(2) ?? 'n/a'}%`];
  for (const h of portfolio.holdings) {
    lines.push(
      `- ${h.symbol} x${h.shares} sector=${h.sector || '?'} close=${h.close ?? '?'} chg=${h.changePct ?? '?'}% divYield=${h.dividendYield ?? '?'}`
    );
    if (h.sentimentNotes?.length) lines.push(`  news: ${h.sentimentNotes.join(' | ')}`);
  }
  return lines.join('\n');
}

function formatToolsBlock(retrieval) {
  const lines = [`Exchange: ${retrieval.exchange}`, `Intent: ${retrieval.intent || 'general'}`];
  if (retrieval.symbol) lines.push(`Focus symbol: ${retrieval.symbol}`);

  const { tools } = retrieval;

  if (tools.movers) {
    lines.push('Top gainers (database):');
    for (const r of tools.movers.gainers?.slice(0, 8) || []) {
      lines.push(`  + ${r.symbol} ${r.changePct}% close=${r.close}`);
    }
    lines.push('Top decliners (database):');
    for (const r of tools.movers.losers?.slice(0, 6) || []) {
      lines.push(`  - ${r.symbol} ${r.changePct}% close=${r.close}`);
    }
  }

  if (tools.prices?.topMovers) {
    lines.push('Recent movers:');
    for (const r of tools.prices.topMovers.slice(0, 10)) {
      lines.push(`  ${r.symbol} close=${r.close} chg=${r.changePct}%`);
    }
  } else if (tools.prices?.close != null) {
    const p = tools.prices;
    lines.push(`Focus stock price: close=${p.close} change=${p.changePct}% date=${p.tradeDate || 'n/a'}`);
  }

  if (tools.stock?.name) {
    lines.push(`Company: ${tools.stock.name} (${tools.stock.symbol}) sector=${tools.stock.sector || 'n/a'}`);
  }

  if (tools.candidates?.length) {
    lines.push('High-yield dividend candidates (database):');
    lines.push(formatCandidates(tools.candidates));
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
  }

  if (tools.dividends?.profile) {
    const pr = tools.dividends.profile;
    lines.push(`Dividend profile: freq=${pr.frequency} yield=${pr.dividend_yield} annual=${pr.annual_rate}`);
  }

  if (tools.sentiment) {
    lines.push('Scraped sentiment (news + AI commentary + price signals):');
    lines.push(formatSentimentBlock(tools.sentiment));
  }

  if (tools.portfolio) {
    lines.push('User portfolio (from request):');
    lines.push(formatPortfolioBlock(tools.portfolio));
  }

  if (tools.news?.length) {
    lines.push('News headlines:');
    for (const n of tools.news.slice(0, 5)) {
      lines.push(`  - ${n.headline}`);
    }
  }

  return lines.join('\n');
}

function buildEnhancedSystemPrompt(exchangeCode, intent, legacyDigest) {
  const cfg = exchangeService.getExchangeConfig(exchangeCode);
  const portfolioGuide =
    intent === 'portfolio_research' || intent === 'ideas_research'
      ? `
PORTFOLIO / IDEAS MODE (research only — NOT trade instructions):
- Suggest 3-5 symbols to **research further**, ranked by database dividend yield, price momentum, and scraped sentiment.
- For each idea: bullet with symbol, 1-line data rationale, sentiment read, and 1 risk.
- If holdings were provided, comment on sector concentration and whether diversification may help (probabilistic language).
- You MAY show an **illustrative** sample allocation (percent weights) only if the user asked about portfolio sizing — label it "hypothetical research mix, not advice".
- NEVER say "buy now", "sell", "guaranteed", or "you should purchase". Use "may warrant research", "historically showed", "database suggests".
`
      : '';

  return `You are "Market Buddy" on DividendFlow — a database-connected dividend and market research assistant.

Active exchange: ${cfg.name} (${cfg.code}), currency ${cfg.currency}.
You learn ONLY from DividendFlow's PostgreSQL database and archived scrape files provided below — treat them as your knowledge base.

Rules:
1) Use ONLY facts from DATA blocks. Never invent tickers, prices, yields, or headlines.
2) Probabilistic language only ("may", "could", "historically") — no guaranteed returns.
3) Not a licensed adviser — no personalized tax/legal guidance.
4) Missing data → say "unavailable in our database" only when the Focus symbol block is empty.
5) When Focus symbol data IS present, answer about that company using price, dividend, and news fields — do not claim data is missing.
6) End with "Confidence: NN/100" (0-100 based on data completeness).
7) Include 1-3 risk bullets when discussing stocks or portfolios.
${portfolioGuide}
Data freshness (archived scrapes + Supabase — not live market):
${legacyDigest || 'See retrieval block.'}

Close with: "Remember: ${INVESTMENT_DISCLAIMER.slice(0, 100)}..."`;
}

function buildUserBlock(retrieval, message, legacyDataBlock, chatHistory) {
  const structured = formatToolsBlock(retrieval);
  let historyBlock = '';
  if (chatHistory?.length) {
    historyBlock = chatHistory
      .slice(-6)
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${String(m.text).slice(0, 400)}`)
      .join('\n');
  }

  return `DATABASE RETRIEVAL (PostgreSQL + scrapes):
---
${structured}
---

ARCHIVED SCRAPE FILES (supplement):
---
${legacyDataBlock || '(none)'}
---

RECENT CHAT (context only):
---
${historyBlock || '(new conversation)'}
---

USER QUESTION:
${message}`;
}

function estimateConfidence(retrieval) {
  let score = 25;
  const { tools } = retrieval;
  if (tools.stock) score += 15;
  if (tools.prices?.close != null) score += 15;
  if (tools.movers) score += 10;
  if (tools.candidates?.length) score += 15;
  if (tools.dividends) score += 15;
  if (tools.metrics) score += 10;
  if (tools.sentiment?.aggregate) {
    const t = tools.sentiment.aggregate.bullish + tools.sentiment.aggregate.bearish;
    if (t > 0) score += 10;
  }
  if (tools.portfolio?.holdings?.length) score += 10;
  if (tools.news?.length) score += 5;
  return Math.min(100, score);
}

async function retrieveEnhanced(exchangeCode, symbol, question, holdings) {
  const code = exchangeService.normalizeExchangeCode(exchangeCode);
  const intent = classifyIntent(question);
  const tools = {};

  const [movers, sentiment, candidates] = await Promise.all([
    marketBuddyRag.fetchTopMoversFromDb(code),
    marketBuddyRag.fetchDbSentiment(code),
    intent === 'dividend_hunt' || intent === 'ideas_research' || intent === 'portfolio_research'
      ? marketBuddyRag.fetchTopDividendCandidates(code, 15)
      : Promise.resolve([]),
  ]);

  tools.movers = movers;
  tools.sentiment = sentiment;
  tools.candidates = candidates;

  if (symbol) {
    const detail = await globalDataStore.getStockDetail(code, symbol);
    if (detail) {
      tools.stock = { symbol: detail.symbol, name: detail.name, sector: detail.sector };
      tools.prices = detail.price;
      tools.dividends = detail.dividends;
      tools.news = detail.news?.slice(0, 5);
      tools.metrics = detail.metrics;
    }
  } else {
    tools.prices = { topMovers: movers.gainers?.concat(movers.losers?.slice(0, 5) || []) };
  }

  if (holdings?.length) {
    tools.portfolio = await marketBuddyRag.analyzeHoldings(code, holdings);
  }

  if (intent === 'dividend_hunt' && !tools.dividends) {
    const dividendResult = await globalDataStore.getDividendsForExchange(code, { minYield: 2 });
    tools.dividendList = Array.isArray(dividendResult) ? dividendResult : dividendResult.rows;
  }

  return { exchange: code, symbol: symbol || null, intent, tools };
}

function parseHoldingsFromMessage(message) {
  const q = String(message || '');
  if (!/\b(hold|holding|holdings|own|portfolio|allocated)\b/i.test(q)) return [];
  const stop = new Set(['I', 'MY', 'THE', 'AND', 'FOR', 'YOU', 'ASK', 'WHAT', 'WHICH', 'FROM', 'WITH']);
  const tokens = q.toUpperCase().match(/\b[A-Z]{2,5}\b/g) || [];
  return [...new Set(tokens.filter((t) => !stop.has(t)))].slice(0, 12).map((symbol) => ({ symbol, shares: 0 }));
}

async function prepareMarketChatContext({
  message,
  exchange,
  symbol,
  holdings,
  chatHistory,
  legacyDigest,
  legacyDataBlock,
}) {
  const exchangeCode = exchangeService.normalizeExchangeCode(exchange);
  let detectedSymbol = symbol ? String(symbol).toUpperCase() : null;

  if (!detectedSymbol && message) {
    detectedSymbol = await resolveSymbolFromMessage(message, exchangeCode);
  }

  const parsedHoldings = parseHoldingsFromMessage(message);
  const mergedHoldings = [...(holdings || []), ...parsedHoldings].slice(0, 25);

  const retrieval = await retrieveEnhanced(exchangeCode, detectedSymbol, message, mergedHoldings);
  const intent = retrieval.intent;
  const systemPrompt = buildEnhancedSystemPrompt(exchangeCode, intent, legacyDigest);
  const userBlock = buildUserBlock(retrieval, message, legacyDataBlock, chatHistory);
  const confidenceHint = estimateConfidence(retrieval);

  return {
    systemPrompt,
    userBlock,
    retrieval,
    confidenceHint,
    exchange: exchangeCode,
    intent,
    focusSymbol: detectedSymbol,
  };
}

async function persistChatInsight(exchange, symbol, reply, confidence) {
  if (!reply || reply.length < 80) return;
  await marketBuddyRag.saveInsight(exchange, symbol, reply, confidence, 'market_chat');
}

module.exports = {
  prepareMarketChatContext,
  persistChatInsight,
  retrieveEnhanced,
  formatToolsBlock,
  estimateConfidence,
  classifyIntent,
  resolveSymbolFromMessage,
};
