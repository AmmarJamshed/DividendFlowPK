#!/usr/bin/env node
/**
 * DividendFlow.pk Market Research Crawler Agent
 * Collects allowlisted public evidence + PSX stock join → JSON + branded HTML.
 *
 * Usage:
 *   node market-research-agent.js --topic "Pakistan fast food market" --audience market_researcher --symbols NESTLE,UNITY
 *   node market-research-agent.js --topic "Pakistan cement demand" --audience demand_planner --symbols LUCK,MLCF,DGKC --offline
 */
import axios from 'axios';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA = join(ROOT, 'data');
const RESEARCH_DIR = join(ROOT, 'research');
const OUT_JSON = join(DATA, 'research');
const OUT_HTML = join(ROOT, 'docs', 'research');
const JOBS_DIR = join(OUT_JSON, 'jobs');
const USER_AGENT = 'DividendFlowPK-ResearchAgent/1.0 (+https://dividendflow.pk)';

const ALLOWLIST = [
  { url: 'https://www.trade.gov/country-commercial-guides/pakistan-franchising', title: 'U.S. Trade.gov — Pakistan Franchising', year: '2019' },
  { url: 'https://invest.gov.pk/food-processing', title: 'BOI — Food Processing', year: '2020' },
  { url: 'https://invest.gov.pk/node/1312', title: 'BOI — Food Processing incentives', year: '2020' },
  { url: 'http://www.invest.gov.pk/node/1263', title: 'BOI — SEZ incentives', year: '2020' },
  { url: 'https://pide.org.pk/research/hotel-and-restaurant-industries-of-pakistan-opportunities-and-market-dynamics/', title: 'PIDE — Hotel & Restaurant Industries', year: '2022' },
  { url: 'https://propakistani.pk/perspective/gastronomy-growth-pakistans-emerging-food-economy/', title: 'ProPakistani — Gastronomy & Growth', year: '2025' },
  { url: 'https://www.statista.com/outlook/cmo/food/pakistan', title: 'Statista — Food Pakistan', year: '2024' },
  { url: 'https://www.dawn.com/feeds/business', title: 'Dawn Business RSS', year: String(new Date().getFullYear()) },
];

const TOPIC_SYMBOL_HEURISTICS = [
  { re: /fast\s*food|restaurant|qsr|fmcg|food|dairy|beverage/i, symbols: ['NESTLE', 'UNITY', 'COLG', 'NATF'] },
  { re: /cement|construction|housing/i, symbols: ['LUCK', 'MLCF', 'DGKC', 'CHCC'] },
  { re: /fertilizer|agri|urea/i, symbols: ['FFC', 'EFERT', 'FATIMA'] },
  { re: /bank|financ|insurance/i, symbols: ['HBL', 'MCB', 'UBL', 'MEBL'] },
  { re: /oil|gas|energy|power|petroleum/i, symbols: ['OGDC', 'PPL', 'PSO', 'HUBC'] },
  { re: /tech|software|it\b/i, symbols: ['SYS', 'TRG', 'AVN'] },
  { re: /textile|apparel|cotton/i, symbols: ['GATM', 'NML', 'KTML'] },
];

function parseArgs(argv) {
  const out = {
    topic: '',
    audience: 'market_researcher',
    symbols: [],
    geo: 'Pakistan',
    offline: false,
    jobId: null,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--topic' && next) { out.topic = next; i += 1; }
    else if (a === '--audience' && next) { out.audience = next; i += 1; }
    else if (a === '--symbols' && next) {
      out.symbols = next.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
      i += 1;
    } else if (a === '--geo' && next) { out.geo = next; i += 1; }
    else if (a === '--offline') out.offline = true;
    else if (a === '--job-id' && next) { out.jobId = next; i += 1; }
  }
  if (!['analyst', 'market_researcher', 'demand_planner'].includes(out.audience)) {
    out.audience = 'market_researcher';
  }
  return out;
}

function slugify(text, geo = '') {
  let base = String(text || 'report')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'report';
  const g = String(geo || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (g && !base.startsWith(`${g}-`)) base = `${g}-${base}`;
  return base.slice(0, 90);
}

function ensureDirs() {
  for (const d of [OUT_JSON, OUT_HTML, JOBS_DIR, join(ROOT, 'docs', 'theme')]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }
}

function writeJob(jobId, patch) {
  if (!jobId) return;
  ensureDirs();
  const path = join(JOBS_DIR, `${jobId}.json`);
  let cur = {};
  if (existsSync(path)) {
    try { cur = JSON.parse(readFileSync(path, 'utf8')); } catch { /* ignore */ }
  }
  const next = { ...cur, ...patch, updated_at: new Date().toISOString() };
  writeFileSync(path, JSON.stringify(next, null, 2));
}

function readCsv(relativePath) {
  const full = join(DATA, ...relativePath.split('/'));
  if (!existsSync(full)) return [];
  const lines = readFileSync(full, 'utf8').split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map((line) => {
    const vals = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') inQ = !inQ;
      else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    vals.push(cur.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = (vals[i] || '').replace(/^"|"$/g, ''); });
    return row;
  });
}

function heuristicSymbols(topic, explicit) {
  if (explicit.length) return [...new Set(explicit)];
  const found = [];
  for (const rule of TOPIC_SYMBOL_HEURISTICS) {
    if (rule.re.test(topic)) found.push(...rule.symbols);
  }
  return [...new Set(found)].slice(0, 6);
}

function loadStockSnapshot(symbols) {
  const changes = readCsv('prices/price_changes.csv');
  const calendar = readCsv('dividends/psx_dividend_calendar.csv');
  const bySym = new Map();
  for (const row of changes) {
    const sym = String(row.Company || row.company || '').toUpperCase();
    if (!sym) continue;
    bySym.set(sym, {
      symbol: sym,
      name: sym,
      sector: '',
      price: parseFloat(row.Price) || null,
      change_pct: parseFloat(row.ChangePct) || null,
      as_of: row.Date || null,
      dividend_yield: null,
    });
  }
  for (const row of calendar) {
    const sym = String(row.Company || row.company || '').toUpperCase();
    if (!sym || !bySym.has(sym)) continue;
    const y = parseFloat(String(row.Dividend_yield || row.Dividend_Yield || '').replace('%', ''));
    if (Number.isFinite(y)) bySym.get(sym).dividend_yield = y;
    if (row.Sector) bySym.get(sym).sector = row.Sector;
  }
  const resolved = symbols.map((s) => bySym.get(s)).filter(Boolean);
  return {
    symbols_requested: symbols,
    resolved,
    note: resolved.length
      ? `Joined ${resolved.length} PSX symbol(s) from DividendFlow price/dividend store.`
      : 'No listed peer match in local PSX data for the requested/heuristic symbols.',
  };
}

async function fetchText(url, timeout = 12000) {
  try {
    const { data, status } = await axios.get(url, {
      timeout,
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      maxRedirects: 3,
      validateStatus: (s) => s >= 200 && s < 400,
      responseType: 'text',
    });
    const text = String(data || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 4000);
    return { ok: true, status, text };
  } catch (err) {
    return { ok: false, status: 0, text: '', error: err.message };
  }
}

function tryParallelSearch(topic, geo) {
  const objective = `${geo} ${topic} market size economics barriers incentives industry statistics`;
  const r = spawnSync(
    'parallel-cli',
    ['search', objective, '-q', `${geo} ${topic} market size`, '-q', `${geo} ${topic} industry growth`, '--json', '--max-results', '8', '--excerpt-max-chars-total', '12000'],
    { encoding: 'utf8', timeout: 45000, shell: true }
  );
  if (r.status !== 0 || !r.stdout) return [];
  try {
    const parsed = JSON.parse(r.stdout);
    const results = parsed.results || parsed || [];
    return (Array.isArray(results) ? results : []).slice(0, 10).map((item) => ({
      title: item.title || 'Search result',
      url: item.url,
      year: (item.publish_date || '').slice(0, 4) || String(new Date().getFullYear()),
      excerpt: Array.isArray(item.excerpts) ? item.excerpts.join(' ').slice(0, 800) : String(item.excerpt || '').slice(0, 800),
    })).filter((x) => x.url);
  } catch {
    return [];
  }
}

async function collectEvidence(topic, geo) {
  const evidence = [];
  const searchHits = tryParallelSearch(topic, geo);
  for (const hit of searchHits) {
    evidence.push({
      title: hit.title,
      url: hit.url,
      year: hit.year,
      excerpt: hit.excerpt,
      via: 'parallel-cli',
    });
  }

  const topicLower = topic.toLowerCase();
  const picks = ALLOWLIST.filter((a) => {
    if (/food|restaurant|franchise|fmcg|qsr|dairy/i.test(topicLower)) return true;
    if (/cement|construction/i.test(topicLower) && /invest\.gov|trade\.gov|dawn/i.test(a.url)) return true;
    return /dawn|invest\.gov|trade\.gov|pide/i.test(a.url);
  }).slice(0, 6);

  for (const src of picks) {
    const fetched = await fetchText(src.url);
    evidence.push({
      title: src.title,
      url: src.url,
      year: src.year,
      excerpt: fetched.ok ? fetched.text.slice(0, 1200) : `(fetch failed: ${fetched.error || 'n/a'})`,
      via: 'allowlist-fetch',
      fetch_ok: fetched.ok,
    });
  }

  return evidence;
}

function buildOfflineReport({ topic, geo, audience, symbols, stocks, evidence }) {
  const slug = slugify(topic, geo);
  const year = String(new Date().getFullYear());
  const sources = evidence
    .filter((e) => e.url)
    .map((e) => ({
      title: e.title,
      url: e.url,
      year: e.year || year,
      excerpt: (e.excerpt || '').slice(0, 280),
    }));
  if (!sources.length) {
    sources.push({
      title: 'BOI — Food Processing',
      url: 'https://invest.gov.pk/food-processing',
      year: '2020',
      excerpt: 'Fallback official source when crawl returned empty.',
    });
  }
  const primary = sources[0];
  const isFood = /food|restaurant|qsr|franchise/i.test(topic);
  const isCement = /cement/i.test(topic);

  const market_layers = isFood
    ? [
        { label: 'Eating out (PFA via Trade.gov)', value: '$6–9 bn / year', year: '2019', url: 'https://www.trade.gov/country-commercial-guides/pakistan-franchising', source_title: 'U.S. Trade.gov' },
        { label: 'Registered restaurants', value: '256,926+', year: '2025', url: 'https://propakistani.pk/perspective/gastronomy-growth-pakistans-emerging-food-economy/', source_title: 'ProPakistani' },
        { label: 'Pakistan Food market', value: '$115.4 bn', year: '2024', url: 'https://www.statista.com/outlook/cmo/food/pakistan', source_title: 'Statista' },
      ]
    : isCement
      ? [
          { label: 'Topic focus', value: 'Cement / construction demand', year, url: primary.url, source_title: primary.title },
          { label: 'Policy / investment context', value: 'See BOI / industry sources', year: '2020', url: 'https://invest.gov.pk/food-processing', source_title: 'BOI (cross-sector hub)' },
          { label: 'Listed peer coverage', value: `${stocks.resolved.length} PSX names`, year, url: primary.url, source_title: 'DividendFlow PSX store' },
        ]
      : [
          { label: 'Research topic', value: topic, year, url: primary.url, source_title: primary.title },
          { label: 'Evidence items collected', value: String(evidence.length), year, url: primary.url, source_title: 'Crawl meta' },
          { label: 'Listed peer coverage', value: `${stocks.resolved.length} PSX names`, year, url: primary.url, source_title: 'DividendFlow PSX store' },
        ];

  const productScores = isFood
    ? [
        { name: 'Fried chicken / broast', score: 92, verdict: 'Core demand', rationale: 'High cultural fit' },
        { name: 'Burgers', score: 90, verdict: 'Strong', rationale: 'Global + local love' },
        { name: 'Pizza', score: 88, verdict: 'Strong', rationale: 'Family occasions' },
        { name: 'Shawarma wraps', score: 87, verdict: 'High volume', rationale: 'Close to local rolls' },
        { name: 'Plant burgers', score: 58, verdict: 'Niche', rationale: 'Urban only for now' },
      ]
    : isCement
      ? [
          { name: 'Bag cement demand', score: 86, verdict: 'Watch housing cycle', rationale: 'Construction linked' },
          { name: 'Export / clinker', score: 72, verdict: 'Secondary', rationale: 'FX + freight sensitive' },
          { name: 'Retail bagged cement', score: 80, verdict: 'Steady', rationale: 'Domestic distribution' },
        ]
      : [
          { name: 'Core category demand', score: 78, verdict: 'Investigate further', rationale: 'Based on thin public evidence' },
          { name: 'Export potential', score: 65, verdict: 'Conditional', rationale: 'Needs more sources' },
          { name: 'Digital / delivery channel', score: 70, verdict: 'Rising', rationale: 'Urban convenience trend' },
        ];

  const smart_gaps = [
    { gap: 'Planner-grade demand forecast pack', why_missed: 'News apps lack structured volume forecasts', idea: 'Monthly demand brief with PSX supplier prices', opportunity_score: 84, who_pays: 'Demand planners / ops' },
    { gap: 'Cited market-size dashboard', why_missed: 'Scatter of PDFs and paywalled reports', idea: 'Living HTML pack with year+URL chips', opportunity_score: 88, who_pays: 'Market researchers' },
    { gap: 'Listed-supplier risk watch', why_missed: 'Sector notes rarely join live tickers', idea: 'Auto stock join for peers', opportunity_score: 82, who_pays: 'Analysts / procurement' },
  ];

  return {
    slug,
    topic,
    geo,
    audience,
    generated_at: new Date().toISOString(),
    executive_snapshot: isFood
      ? 'Simple Word answer: Pakistan already has a large eating-out market (about $6–9 bn/year in public Trade.gov citations). Local + international brands share demand. Hard doors are licenses, rent, and delivery fees. Factory/SEZ incentives help processors more than single shops. Best familiar foods score high; smart gaps sit in planned nutrition and trust meals.'
      : `Simple Word answer: Research pack for “${topic}” in ${geo}. Evidence items: ${evidence.length}. Listed peers resolved: ${stocks.resolved.length}. Use sources below for sizing; treat thin evidence as a signal to dig deeper — not as a finished market size.`,
    market_layers,
    economics: {
      drivers: [
        { text: 'Urban demand and convenience channels keep expanding in Pakistan consumer markets.', year: primary.year, url: primary.url, source_title: primary.title },
        { text: 'Public investment / industry pages highlight food and related processing as a priority developmental area.', year: '2020', url: 'https://invest.gov.pk/food-processing', source_title: 'BOI Food Processing' },
      ],
      restraints: [
        { text: 'Documentation and operating frictions raise barriers for hospitality and restaurant-like businesses.', year: '2022', url: 'https://pide.org.pk/research/hotel-and-restaurant-industries-of-pakistan-opportunities-and-market-dynamics/', source_title: 'PIDE KB 76' },
        { text: 'Price sensitivity and thin margins compress growth when input costs or platform fees rise.', year: primary.year, url: primary.url, source_title: primary.title },
      ],
      cost_split_pct: [
        { label: 'COGS / inputs', value: 34 },
        { label: 'Rent / utilities', value: 16 },
        { label: 'Staff', value: 18 },
        { label: 'Distribution / marketing', value: 14 },
        { label: 'Tax / other', value: 10 },
        { label: 'Profit', value: 8 },
      ],
    },
    barriers: [
      { text: 'Licenses, food-authority / municipal paperwork, and slow responses deter new operators.', year: '2022', url: 'https://pide.org.pk/research/hotel-and-restaurant-industries-of-pakistan-opportunities-and-market-dynamics/', source_title: 'PIDE' },
      { text: 'Skilled labor often needs in-house training.', year: '2022', url: 'https://pide.org.pk/research/hotel-and-restaurant-industries-of-pakistan-opportunities-and-market-dynamics/', source_title: 'PIDE' },
    ],
    incentives: [
      { text: 'BOI lists customs and related concessions for food processing capital goods and some value-added chicken inputs.', year: '2020', url: 'https://invest.gov.pk/node/1312', source_title: 'BOI incentives' },
      { text: 'SEZ framework offers capital-goods duty relief and multi-year income tax holidays for qualifying enterprises.', year: '2020', url: 'http://www.invest.gov.pk/node/1263', source_title: 'BOI SEZ' },
    ],
    menu_or_product_scores: productScores,
    smart_gaps,
    stocks,
    sources,
    charts: {
      layers: market_layers.map((m, i) => ({ label: m.label.slice(0, 28), value: isFood ? [7.5, 2.5, 115.4][i] || i + 1 : stocks.resolved.length + i + 1 })),
      product_scores: productScores.map((p) => ({ label: p.name, value: p.score })),
      gap_scores: smart_gaps.map((g) => ({ label: g.gap.slice(0, 32), value: g.opportunity_score })),
    },
    ml_notes: 'Scores are transparent heuristics (content-fit style). Replace with survey + sales data for production forecasting.',
    crawl_meta: {
      evidence_count: evidence.length,
      mode: 'offline',
      symbols,
    },
  };
}

async function synthesizeWithGroq({ topic, geo, audience, stocks, evidence, symbols }) {
  const key = (process.env.GROQ_API_KEY || '').trim();
  if (!key) return null;
  const model = (process.env.GROQ_MODEL || 'openai/gpt-oss-20b').trim();
  const promptPath = join(RESEARCH_DIR, 'prompts', 'synthesize.md');
  const system = existsSync(promptPath) ? readFileSync(promptPath, 'utf8') : 'Return JSON only.';
  const user = JSON.stringify({
    topic,
    geo,
    audience,
    symbols,
    stocks,
    evidence: evidence.slice(0, 12),
    instruction: 'Emit one JSON object matching research/schema/report.schema.json. No markdown fences.',
  });

  const { data } = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    },
    {
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      timeout: 90000,
    }
  );
  const raw = data?.choices?.[0]?.message?.content || '{}';
  const report = JSON.parse(raw);
  report.slug = report.slug || slugify(topic, geo);
  report.stocks = stocks;
  report.generated_at = report.generated_at || new Date().toISOString();
  report.crawl_meta = { ...(report.crawl_meta || {}), mode: 'groq', evidence_count: evidence.length };
  return report;
}

function validateCitations(report) {
  const problems = [];
  const check = (item, path) => {
    if (!item) return;
    if (!item.year) problems.push(`${path}: missing year`);
    if (!item.url || !/^https?:\/\//i.test(item.url)) problems.push(`${path}: missing/invalid url`);
  };
  (report.market_layers || []).forEach((x, i) => check(x, `market_layers[${i}]`));
  (report.economics?.drivers || []).forEach((x, i) => check(x, `drivers[${i}]`));
  (report.economics?.restraints || []).forEach((x, i) => check(x, `restraints[${i}]`));
  (report.barriers || []).forEach((x, i) => check(x, `barriers[${i}]`));
  (report.incentives || []).forEach((x, i) => check(x, `incentives[${i}]`));
  (report.sources || []).forEach((x, i) => check(x, `sources[${i}]`));
  if (/baby/i.test(JSON.stringify(report))) problems.push('forbidden word: baby');
  return problems;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function citeLi(item) {
  return `<li>${escapeHtml(item.text || item.label || '')} — <span class="yr">${escapeHtml(item.year)}</span> <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.source_title || item.url)}</a>${item.value ? ` · <strong>${escapeHtml(item.value)}</strong>` : ''}</li>`;
}

function renderHtml(report) {
  const templatePath = join(RESEARCH_DIR, 'templates', 'dfpk-report.html');
  let html = readFileSync(templatePath, 'utf8');
  const coverCandidates = [
    join(ROOT, 'docs', 'theme', 'dfpk-theme-01-title.png'),
    join(ROOT, 'frontend', 'build', 'theme', 'dfpk-theme-01-title.png'),
    join(ROOT, 'frontend', 'public', 'theme', 'dfpk-theme-01-title.png'),
  ];
  let coverRel = '../theme/dfpk-theme-01-title.png';
  for (const c of coverCandidates) {
    if (existsSync(c)) {
      coverRel = '../theme/dfpk-theme-01-title.png';
      break;
    }
  }

  const statCards = (report.market_layers || []).slice(0, 4).map((m) => `
    <div class="stat">
      <div class="n">${escapeHtml(m.value)}</div>
      <div class="l">${escapeHtml(m.label)}</div>
      <div class="src"><span class="yr">${escapeHtml(m.year)}</span> <a href="${escapeHtml(m.url)}" target="_blank" rel="noopener">${escapeHtml(m.source_title || 'Source')}</a></div>
    </div>`).join('');

  const stockCards = (report.stocks?.resolved || []).map((s) => `
    <div class="stock-card">
      <div class="sym">${escapeHtml(s.symbol)}</div>
      <div class="px">${s.price != null ? `Rs ${escapeHtml(s.price)}` : '—'}</div>
      <div style="font-size:.8rem;color:#5a6a7e">${s.change_pct != null ? `${escapeHtml(s.change_pct)}%` : ''} ${s.as_of ? `· ${escapeHtml(s.as_of)}` : ''}</div>
      <div style="font-size:.75rem;margin-top:4px">${s.dividend_yield != null ? `Yield ~ ${escapeHtml(s.dividend_yield)}%` : escapeHtml(s.sector || '')}</div>
    </div>`).join('') || '<p>No listed peer match.</p>';

  const replacements = {
    '{{TITLE}}': escapeHtml(report.topic),
    '{{GEO}}': escapeHtml(report.geo),
    '{{AUDIENCE}}': escapeHtml(report.audience),
    '{{GENERATED_AT}}': escapeHtml(report.generated_at),
    '{{COVER_IMG}}': coverRel,
    '{{EXECUTIVE_SNAPSHOT}}': escapeHtml(report.executive_snapshot),
    '{{STAT_CARDS}}': statCards,
    '{{MARKET_LAYERS_LIST}}': (report.market_layers || []).map(citeLi).join(''),
    '{{DRIVERS_LIST}}': (report.economics?.drivers || []).map(citeLi).join(''),
    '{{RESTRAINTS_LIST}}': (report.economics?.restraints || []).map(citeLi).join(''),
    '{{BARRIERS_LIST}}': (report.barriers || []).map(citeLi).join(''),
    '{{INCENTIVES_LIST}}': (report.incentives || []).map(citeLi).join(''),
    '{{SCORE_ROWS}}': (report.menu_or_product_scores || []).map((r) => `<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.score)}</td><td>${escapeHtml(r.verdict)}</td></tr>`).join(''),
    '{{ML_NOTES}}': escapeHtml(report.ml_notes || ''),
    '{{GAP_ROWS}}': (report.smart_gaps || []).map((g) => `<tr><td>${escapeHtml(g.gap)}</td><td>${escapeHtml(g.opportunity_score)}</td><td>${escapeHtml(g.who_pays)}</td><td>${escapeHtml(g.idea || g.why_missed || '')}</td></tr>`).join(''),
    '{{STOCKS_NOTE}}': escapeHtml(report.stocks?.note || ''),
    '{{STOCK_CARDS}}': stockCards,
    '{{SOURCES_LIST}}': (report.sources || []).map((s) => `<li><span class="yr">${escapeHtml(s.year)}</span> <a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.title)}</a>${s.excerpt ? ` — ${escapeHtml(s.excerpt.slice(0, 160))}` : ''}</li>`).join(''),
    '{{CHART_LAYERS_JSON}}': JSON.stringify(report.charts?.layers || []),
    '{{CHART_SCORES_JSON}}': JSON.stringify(report.charts?.product_scores || []),
    '{{CHART_GAPS_JSON}}': JSON.stringify(report.charts?.gap_scores || []),
  };

  for (const [k, v] of Object.entries(replacements)) {
    html = html.split(k).join(v);
  }
  return html;
}

function writeFreshness(slug) {
  const path = join(OUT_JSON, '_freshness.json');
  let cur = { reports: {} };
  if (existsSync(path)) {
    try { cur = JSON.parse(readFileSync(path, 'utf8')); } catch { /* ignore */ }
  }
  cur.reports[slug] = { updated_at: new Date().toISOString() };
  cur.last_run = new Date().toISOString();
  writeFileSync(path, JSON.stringify(cur, null, 2));
}

export async function runMarketResearch(options = {}) {
  const topic = options.topic || '';
  if (!topic.trim()) throw new Error('--topic is required');
  const audience = options.audience || 'market_researcher';
  const geo = options.geo || 'Pakistan';
  const offline = Boolean(options.offline) || !(process.env.GROQ_API_KEY || '').trim();
  const jobId = options.jobId || null;
  const symbols = heuristicSymbols(topic, options.symbols || []);

  ensureDirs();
  writeJob(jobId, { id: jobId, status: 'running', topic, audience, geo, symbols });

  const evidence = await collectEvidence(topic, geo);
  writeJob(jobId, { status: 'crawling_done', evidence_count: evidence.length });

  const stocks = loadStockSnapshot(symbols);
  let report = null;
  if (!offline) {
    try {
      report = await synthesizeWithGroq({ topic, geo, audience, stocks, evidence, symbols });
    } catch (err) {
      console.warn('[research-agent] Groq failed, falling back offline:', err.message);
    }
  }
  if (!report) {
    report = buildOfflineReport({ topic, geo, audience, symbols, stocks, evidence });
  }

  const problems = validateCitations(report);
  if (problems.length) {
    console.warn('[research-agent] citation warnings:', problems.slice(0, 8).join('; '));
  }

  const jsonPath = join(OUT_JSON, `${report.slug}.json`);
  const htmlPath = join(OUT_HTML, `${report.slug}-report.html`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(htmlPath, renderHtml(report));
  writeFreshness(report.slug);

  const result = {
    status: 'completed',
    slug: report.slug,
    json_path: jsonPath,
    html_path: htmlPath,
    html_url: `/docs/research/${report.slug}-report.html`,
    evidence_count: evidence.length,
    stocks_resolved: stocks.resolved.length,
    warnings: problems,
  };
  writeJob(jobId, result);
  return { report, ...result };
}

export function listReports() {
  ensureDirs();
  if (!existsSync(OUT_JSON)) return [];
  return readdirSync(OUT_JSON)
    .filter((f) => f.endsWith('.json') && f !== '_freshness.json' && !f.startsWith('.'))
    .filter((f) => !f.includes('/') && existsSync(join(OUT_JSON, f)))
    .map((f) => {
      try {
        const r = JSON.parse(readFileSync(join(OUT_JSON, f), 'utf8'));
        if (!r.slug) return null;
        return {
          slug: r.slug,
          topic: r.topic,
          geo: r.geo,
          audience: r.audience,
          generated_at: r.generated_at,
          html_url: `/api/v1/research/reports/${r.slug}/html`,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.generated_at).localeCompare(String(a.generated_at)));
}

export function readReport(slug) {
  const path = join(OUT_JSON, `${slug}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function readJob(jobId) {
  const path = join(JOBS_DIR, `${jobId}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = parseArgs(process.argv);
  runMarketResearch(args)
    .then((res) => {
      console.log(JSON.stringify({ ok: true, slug: res.slug, html_path: res.html_path, json_path: res.json_path, stocks: res.stocks_resolved }, null, 2));
    })
    .catch((err) => {
      console.error(JSON.stringify({ ok: false, error: err.message }));
      process.exit(1);
    });
}
