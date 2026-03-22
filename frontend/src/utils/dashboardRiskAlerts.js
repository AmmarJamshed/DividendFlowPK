/**
 * Build dashboard "AI Risk Alerts" from daily news scrape + optional price-move fallback.
 * Rotation uses Asia/Karachi calendar date so alerts change each local day.
 */

export function getPktDateString() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

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
 * @param {object} dailyNews - { news, commentary, priceChanges, priceCommentary }
 * @param {object} opts - { maxAlerts?: number, dateKey?: string }
 */
export function buildDashboardRiskAlerts(dailyNews, opts = {}) {
  const maxAlerts = opts.maxAlerts ?? 4;
  const dateKey = opts.dateKey || getPktDateString();

  const news = dailyNews?.news || [];
  const commentary = dailyNews?.commentary || [];
  const priceChanges = dailyNews?.priceChanges || [];
  const priceCommentary = dailyNews?.priceCommentary || [];

  const commentaryByCo = pickLatestCommentaryPerCompany(commentary);
  let candidates = pickLatestNewsPerCompany(news);

  // Attach AI commentary per company
  let alerts = candidates.map((row) => {
    const company = (row.Company || row.company || '').trim();
    const headline = (row.Headline || row.headline || '').trim();
    const source = (row.Source || row.source || 'News').trim() || 'News';
    const url = (row.Url || row.url || '').trim();
    const cRow = commentaryByCo.get(company);
    const aiText = cRow ? (cRow.Commentary || cRow.commentary || '').trim() : '';
    const level = deriveRiskLevel(headline, aiText);
    return {
      company,
      level,
      headline,
      source,
      url,
      newsDate: row.Date || row.date || null,
      message: aiText || 'No AI summary yet — commentary runs with the daily news job.',
      kind: 'news',
    };
  });

  // Fallback: biggest price movers + optional Groq price commentary
  if (!alerts.length && priceChanges.length) {
    const sorted = [...priceChanges]
      .filter((p) => p.Company || p.company)
      .sort(
        (a, b) =>
          Math.abs(parseFloat(b.ChangePct || b.changePct) || 0) -
          Math.abs(parseFloat(a.ChangePct || a.changePct) || 0)
      );
    const seen = new Set();
    const unique = [];
    for (const p of sorted) {
      const company = (p.Company || p.company || '').trim();
      if (!company || seen.has(company)) continue;
      seen.add(company);
      unique.push(p);
      if (unique.length >= maxAlerts + 4) break;
    }
    alerts = rotateDeterministic(unique, `${dateKey}-price`).slice(0, maxAlerts).map((p) => {
      const company = (p.Company || p.company || '').trim();
      const pct = parseFloat(p.ChangePct || p.changePct) || 0;
      const direction = pct >= 0 ? 'gain' : 'decline';
      const pc = (priceCommentary || []).find(
        (x) =>
          (x.Company || x.company) === company &&
          (x.Direction || x.direction || '').toLowerCase() === direction
      );
      const aiText = (pc?.Commentary || pc?.commentary || '').trim();
      const headline =
        pct >= 0
          ? `Shares up ${pct.toFixed(2)}% (session vs prior close).`
          : `Shares down ${Math.abs(pct).toFixed(2)}% (session vs prior close).`;
      const level = deriveRiskLevel(headline, aiText);
      return {
        company,
        level,
        headline,
        source: 'PSX price data',
        url: '',
        newsDate: p.Date || p.date || null,
        message:
          aiText ||
          'Price move from latest dataset. Run the news scraper for headline-level context.',
        kind: 'price',
      };
    });
  }

  const stable = [...alerts].sort((a, b) => a.company.localeCompare(b.company));
  const rotated = rotateDeterministic(stable, dateKey);
  return rotated.slice(0, maxAlerts).map((a) => ({
    ...a,
    rotationDate: dateKey,
  }));
}
