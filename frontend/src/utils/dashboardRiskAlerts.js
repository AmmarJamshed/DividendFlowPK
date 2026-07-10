/**
 * Dashboard AI Risk Alerts: only when news + meaningful price move align.
 * Optional: PSX/macro/political headlines linked to top decliners (same session).
 * Rotation uses Asia/Karachi calendar date.
 */

export function getPktDateString() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Minimum |%| change to treat as a meaningful move (session vs prior close). */
export const MIN_PRICE_MOVE_PCT = 0.5;

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  }
  return Math.abs(h);
}

function parseTime(row) {
  const d = new Date(row.Date || row.date || 0);
  const t = d.getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Max |ChangePct| per ticker from price batch. */
export function maxAbsPctByCompany(priceChanges) {
  const m = new Map();
  for (const p of priceChanges || []) {
    const c = (p.Company || p.company || '').trim();
    if (!c) continue;
    const v = Math.abs(parseFloat(p.ChangePct || p.changePct) || 0);
    m.set(c, Math.max(m.get(c) || 0, v));
  }
  return m;
}

/** One row per company — keep the most recent headline. */
export function pickLatestNewsPerCompany(newsRows) {
  const byCo = new Map();
  for (const row of newsRows || []) {
    const co = (row.Company || row.company || '').trim();
    if (!co) continue;
    const headline = (row.Headline || row.headline || '').trim();
    if (!headline) continue;
    const prev = byCo.get(co);
    if (!prev || parseTime(row) >= parseTime(prev)) byCo.set(co, row);
  }
  return Array.from(byCo.values());
}

export function pickLatestCommentaryPerCompany(commentaryRows) {
  const byCo = new Map();
  for (const row of commentaryRows || []) {
    const co = (row.Company || row.company || '').trim();
    if (!co) continue;
    const text = (row.Commentary || row.commentary || '').trim();
    if (!text) continue;
    const prev = byCo.get(co);
    if (!prev || parseTime(row) >= parseTime(prev)) byCo.set(co, row);
  }
  return byCo;
}

/** Headlines that often move the whole market or sectors — exchange-aware patterns. */
const MACRO_PATTERNS = {
  PSX: /\b(IMF|World Bank|subsid|subsidy|package|fiscal|budget|PSX|KSE\s*-?\s*100|stock exchange|benchmark index|State Bank|SBP|policy rate|discount rate|MPC|political|government|federal|assembly|senate|tariff|fuel price|circular debt|IPPs?|sovereign|default|reserves|CAD|current account)\b/i,
  NYSE: /\b(Federal Reserve|Fed\b|FOMC|inflation|CPI|PPI|jobs report|nonfarm|SEC\b|S&P\s*500|Dow Jones|NYSE|treasury yield|GDP|recession|tariff|earnings season|interest rate)\b/i,
  NASDAQ: /\b(Federal Reserve|Fed\b|FOMC|inflation|CPI|tech stocks|NASDAQ|Magnificent Seven|AI stocks|chip|semiconductor|SEC\b|earnings|rate cut|treasury yield)\b/i,
  LSE: /\b(Bank of England|BOE|FTSE|inflation|CPI|UK budget|Sterling|GBP|LSE|interest rate|recession|tariff)\b/i,
  HKEX: /\b(Hang Seng|HKEX|Hong Kong|PBOC|China stimulus|property sector|yuan|H share|tariff)\b/i,
  TSE: /\b(Bank of Japan|BOJ|Nikkei|TSE|yen|inflation|GDP)\b/i,
  SSE: /\b(PBOC|Shanghai|SSE|China stocks|stimulus|yuan|GDP)\b/i,
  TADAWUL: /\b(Tadawul|Saudi|oil price|OPEC|Aramco|Vision 2030)\b/i,
};

const DEFAULT_MACRO =
  /\b(stock exchange|benchmark index|central bank|interest rate|inflation|CPI|GDP|recession|earnings|tariff|fiscal|budget|sovereign|default)\b/i;

function macroRegex(exchange) {
  return MACRO_PATTERNS[String(exchange || 'PSX').toUpperCase()] || DEFAULT_MACRO;
}

function marketCommentaryKey(exchange) {
  const code = String(exchange || 'PSX').toUpperCase();
  return `${code}_MARKET`;
}

function pickLatestMacroArticle(newsRows, exchange) {
  const re = macroRegex(exchange);
  const hits = (newsRows || []).filter((r) => re.test(r.Headline || r.headline || ''));
  if (!hits.length) {
    const marketKey = marketCommentaryKey(exchange);
    const tagged = (newsRows || []).filter((r) => (r.Company || r.company) === marketKey);
    if (tagged.length) return tagged[0];
    return null;
  }
  hits.sort((a, b) => parseTime(b) - parseTime(a));
  return hits[0];
}

/** Signed ChangePct for company (row with largest absolute move if duplicates). */
function signedPctForCompany(priceChanges, company) {
  let best = 0;
  let bestAbs = 0;
  for (const p of priceChanges || []) {
    const c = (p.Company || p.company || '').trim();
    if (c !== company) continue;
    const pct = parseFloat(p.ChangePct || p.changePct) || 0;
    if (Math.abs(pct) >= bestAbs) {
      bestAbs = Math.abs(pct);
      best = pct;
    }
  }
  return best;
}

/** Simple keyword tier for display (not investment advice). */
export function deriveRiskLevel(headline, commentary) {
  const t = `${headline || ''} ${commentary || ''}`.toLowerCase();
  const severe =
    /fraud|scandal|default|bankrupt|criminal|arrest|secp|probe|investigation|penalt|fine|lawsuit|litigation|halt|suspension|collapse|embezzl|corruption/;
  const moderate =
    /risk|concern|volatil|regulatory|pressure|decline|cut|downgrade|caution|weak|headwind|uncertain|challenge/;
  if (severe.test(t)) return 'Elevated';
  if (moderate.test(t)) return 'Moderate';
  return 'Watch';
}

function rotateDeterministic(items, dateKey) {
  if (!items.length) return [];
  const offset = hashString(dateKey) % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

/**
 * @param {object} dailyNews - { news, commentary, priceChanges }
 * @param {object} opts - { maxAlerts?: number, dateKey?: string, minPriceMovePct?: number }
 */
export function buildDashboardRiskAlerts(dailyNews, opts = {}) {
  const maxAlerts = opts.maxAlerts ?? 4;
  const dateKey = opts.dateKey || getPktDateString();
  const minMove = opts.minPriceMovePct ?? MIN_PRICE_MOVE_PCT;
  const exchange = String(opts.exchange || dailyNews?.exchange || 'PSX').toUpperCase();
  const marketKey = marketCommentaryKey(exchange);

  const news = dailyNews?.news || [];
  const commentary = dailyNews?.commentary || [];
  const priceChanges = dailyNews?.priceChanges || [];

  const commentaryByCo = pickLatestCommentaryPerCompany(commentary);
  const absMoves = maxAbsPctByCompany(priceChanges);
  const candidates = pickLatestNewsPerCompany(news);

  // 1) Company-specific: headline for that ticker AND meaningful move same batch
  let alerts = candidates
    .map((row) => {
      const company = (row.Company || row.company || '').trim();
      const headline = (row.Headline || row.headline || '').trim();
      const source = (row.Source || row.source || 'News').trim() || 'News';
      const url = (row.Url || row.url || '').trim();
      const cRow = commentaryByCo.get(company);
      const aiText = cRow ? (cRow.Commentary || cRow.commentary || '').trim() : '';
      const level = deriveRiskLevel(headline, aiText);
      const move = absMoves.get(company) || 0;
      const rawPct = signedPctForCompany(priceChanges, company);
      return {
        company,
        level,
        headline,
        source,
        url,
        newsDate: row.Date || row.date || null,
        message:
          aiText ||
          'A short AI summary will appear here when available for this story.',
        kind: 'news',
        priceMovePct: rawPct,
        absMove: move,
      };
    })
    .filter((a) => a.absMove >= minMove);

  const usedCompanies = new Set(alerts.map((a) => a.company));
  const usedHeadlines = new Set(
    alerts.map((a) => String(a.headline || '').toLowerCase()).filter(Boolean)
  );

  // Sort company+move alerts by largest absolute move first
  alerts.sort((a, b) => (b.absMove || 0) - (a.absMove || 0));

  // 2) Macro / market-wide headline → at most ONE card (top decliner), never repeat the same story
  const macro = pickLatestMacroArticle(news, exchange);
  const marketBrief = (
    commentaryByCo.get(marketKey)?.Commentary ||
    commentaryByCo.get(marketKey)?.commentary ||
    ''
  ).trim();

  if (macro && priceChanges.length && alerts.length < maxAlerts) {
    const headline = (macro.Headline || macro.headline || '').trim();
    const headlineKey = headline.toLowerCase();
    if (headline && !usedHeadlines.has(headlineKey)) {
      const source = (macro.Source || macro.source || 'News').trim() || 'News';
      const url = (macro.Url || macro.url || '').trim();
      const decliner = [...priceChanges]
        .map((p) => ({
          company: (p.Company || p.company || '').trim(),
          pct: parseFloat(p.ChangePct || p.changePct) || 0,
          date: p.Date || p.date,
        }))
        .filter((x) => x.company && x.pct < 0 && Math.abs(x.pct) >= minMove && !usedCompanies.has(x.company))
        .sort((a, b) => a.pct - b.pct)[0];

      if (decliner) {
        usedCompanies.add(decliner.company);
        usedHeadlines.add(headlineKey);
        const cRow = commentaryByCo.get(decliner.company);
        const aiExtra = cRow ? (cRow.Commentary || cRow.commentary || '').trim() : '';
        const bridgeMsg = [
          `Session: ${decliner.company} ${decliner.pct.toFixed(2)}% (vs prior close).`,
          `Shown because a macro / market-wide headline appeared the same period — these stories often hit ${exchange} leaders and liquid names first.`,
          marketBrief ? `Macro AI brief: ${marketBrief}` : null,
          aiExtra ? `Company AI brief: ${aiExtra}` : null,
        ]
          .filter(Boolean)
          .join(' ');

        alerts.push({
          company: decliner.company,
          level: deriveRiskLevel(headline, bridgeMsg),
          headline,
          source,
          url,
          newsDate: macro.Date || macro.date || decliner.date,
          message: bridgeMsg,
          kind: 'macro_link',
          priceMovePct: decliner.pct,
          absMove: Math.abs(decliner.pct),
        });
      }
    }
  }

  // 3) Fill remaining slots with other distinct headlines (one card per story)
  if (alerts.length < maxAlerts) {
    const leftoverNews = [...news]
      .map((row) => ({
        company: (row.Company || row.company || '').trim(),
        headline: (row.Headline || row.headline || '').trim(),
        source: (row.Source || row.source || 'News').trim() || 'News',
        url: (row.Url || row.url || '').trim(),
        newsDate: row.Date || row.date || null,
        t: parseTime(row),
      }))
      .filter((r) => r.headline)
      .sort((a, b) => b.t - a.t);

    const unusedMovers = [...priceChanges]
      .map((p) => ({
        company: (p.Company || p.company || '').trim(),
        pct: parseFloat(p.ChangePct || p.changePct) || 0,
      }))
      .filter((x) => x.company && Math.abs(x.pct) >= minMove && !usedCompanies.has(x.company))
      .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));

    for (const row of leftoverNews) {
      if (alerts.length >= maxAlerts) break;
      const headlineKey = row.headline.toLowerCase();
      if (usedHeadlines.has(headlineKey)) continue;

      let company = row.company;
      let pct = company ? signedPctForCompany(priceChanges, company) : 0;
      let absMove = Math.abs(pct || 0);
      let kind = 'news';

      // Company headline without a qualifying move → skip unless we can keep the ticker
      if (company && absMove < minMove) {
        // Still show if this is a real company story; attach session % even if small
        kind = 'news';
      } else if (!company) {
        // Orphan / market headline → pair once with next unused mover
        const mover = unusedMovers.shift();
        if (!mover) continue;
        company = mover.company;
        pct = mover.pct;
        absMove = Math.abs(mover.pct);
        kind = 'macro_link';
      }

      if (!company || usedCompanies.has(company)) continue;

      usedCompanies.add(company);
      usedHeadlines.add(headlineKey);
      const cRow = commentaryByCo.get(company);
      const aiText = cRow ? (cRow.Commentary || cRow.commentary || '').trim() : '';
      alerts.push({
        company,
        level: deriveRiskLevel(row.headline, aiText),
        headline: row.headline,
        source: row.source,
        url: row.url,
        newsDate: row.newsDate,
        message:
          aiText ||
          (kind === 'macro_link'
            ? `Session: ${company} ${pct.toFixed(2)}% (vs prior close). Linked to this market headline.`
            : 'A short AI summary will appear here when available for this story.'),
        kind,
        priceMovePct: pct,
        absMove,
      });
    }
  }

  // Prefer larger moves, then keep one card per unique headline
  const byHeadline = new Map();
  for (const a of alerts) {
    const key = String(a.headline || '').toLowerCase();
    if (!key) continue;
    const prev = byHeadline.get(key);
    if (!prev || (a.absMove || 0) > (prev.absMove || 0)) byHeadline.set(key, a);
  }
  const unique = [...byHeadline.values()].sort((a, b) => (b.absMove || 0) - (a.absMove || 0));
  const rotated = rotateDeterministic(unique, dateKey);
  return rotated.slice(0, maxAlerts).map((a) => {
    const { absMove: _, ...rest } = a;
    return { ...rest, rotationDate: dateKey };
  });
}
