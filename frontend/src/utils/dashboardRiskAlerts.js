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

/** Headlines that often move the whole PSX or sectors (IMF, subsidies, policy, politics). */
const MACRO_HEADLINE_RE =
  /\b(IMF|World Bank|subsid|subsidy|package|fiscal|budget|PSX|KSE\s*-?\s*100|stock exchange|benchmark index|State Bank|SBP|policy rate|discount rate|MPC|political|government|federal|assembly|senate|tariff|fuel price|circular debt|IPPs?|sovereign|default|reserves|CAD|current account)\b/i;

function pickLatestMacroArticle(newsRows) {
  const hits = (newsRows || []).filter((r) =>
    MACRO_HEADLINE_RE.test(r.Headline || r.headline || '')
  );
  if (!hits.length) return null;
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

  const used = new Set(alerts.map((a) => a.company));

  // 2) Macro / PSX-wide headline → tie to largest decliners still having a real move (liquidity names often move on IMF/subsidy news)
  const macro = pickLatestMacroArticle(news);
  const psxMarketBrief = (commentaryByCo.get('PSX_MARKET')?.Commentary || commentaryByCo.get('PSX_MARKET')?.commentary || '').trim();

  if (macro && priceChanges.length && alerts.length < maxAlerts) {
    const headline = (macro.Headline || macro.headline || '').trim();
    const source = (macro.Source || macro.source || 'News').trim() || 'News';
    const url = (macro.Url || macro.url || '').trim();
    const decliners = [...priceChanges]
      .map((p) => ({
        company: (p.Company || p.company || '').trim(),
        pct: parseFloat(p.ChangePct || p.changePct) || 0,
        date: p.Date || p.date,
      }))
      .filter((x) => x.company && x.pct < 0 && Math.abs(x.pct) >= minMove)
      .sort((a, b) => a.pct - b.pct);

    for (const d of decliners) {
      if (alerts.length >= maxAlerts) break;
      if (used.has(d.company)) continue;
      used.add(d.company);
      const cRow = commentaryByCo.get(d.company);
      const aiExtra = cRow ? (cRow.Commentary || cRow.commentary || '').trim() : '';
      const bridgeMsg = [
        `Session: ${d.company} ${d.pct.toFixed(2)}% (vs prior close).`,
        'Shown because a macro / market-wide or policy headline appeared the same day — these stories often hit PSX leaders and liquid names first.',
        psxMarketBrief ? `Macro AI brief: ${psxMarketBrief}` : null,
        aiExtra ? `Company AI brief: ${aiExtra}` : null,
      ]
        .filter(Boolean)
        .join(' ');

      alerts.push({
        company: d.company,
        level: deriveRiskLevel(headline, bridgeMsg),
        headline,
        source,
        url,
        newsDate: macro.Date || macro.date || d.date,
        message: bridgeMsg,
        kind: 'macro_link',
        priceMovePct: d.pct,
        absMove: Math.abs(d.pct),
      });
    }
  }

  // No price-only fallback — pure movers without news stay off this card

  const stable = [...alerts].sort((a, b) => a.company.localeCompare(b.company));
  const rotated = rotateDeterministic(stable, dateKey);
  return rotated.slice(0, maxAlerts).map((a) => {
    const { absMove: _, ...rest } = a;
    return { ...rest, rotationDate: dateKey };
  });
}
