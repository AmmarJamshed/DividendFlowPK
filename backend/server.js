require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;
const DATA_PATH = path.join(__dirname, '..', 'data');

app.use(cors());
app.use(express.json());

// Helper to read CSV file
function readCSV(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    if (!fs.existsSync(filePath)) {
      return resolve([]);
    }
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

// Helper to read all news files for a company
async function getCompanyNews(companyName) {
  const newsPath = path.join(DATA_PATH, 'news');
  if (!fs.existsSync(newsPath)) return [];
  const files = fs.readdirSync(newsPath).filter(f => f.endsWith('.csv') || f.endsWith('.txt'));
  const headlines = [];
  for (const file of files) {
    const filePath = path.join(newsPath, file);
    if (file.endsWith('.csv')) {
      const rows = await readCSV(filePath);
      rows.forEach(row => {
        const company = (row.Company || row.company || '').toLowerCase();
        const headline = (row.Headline || row.headline || row.Title || row.title || '').trim();
        const search = companyName.toLowerCase();
        if ((company && company.includes(search)) || (headline && headline.toLowerCase().includes(search))) {
          headlines.push(headline || 'News item');
        }
      });
    } else {
      const content = fs.readFileSync(filePath, 'utf-8');
      content.split('\n').filter(l => l.trim()).forEach(line => {
        if (line.toLowerCase().includes(companyName.toLowerCase())) headlines.push(line.trim());
      });
    }
  }
  return headlines;
}

// Groq AI Analysis
async function analyzeWithGroq(prompt) {
  const apiKey = getGroqKey();
  if (!apiKey) {
    return {
      riskScore: 50,
      riskCategory: 'Moderate',
      analysis: 'API key not configured. Please add GROQ_API_KEY to backend/.env'
    };
  }
  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.3
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 25000
      }
    );
    const content = response.data.choices[0]?.message?.content || '';
    const scoreMatch = content.match(/\b(\d{1,3})\b/);
    const riskScore = scoreMatch ? Math.min(100, Math.max(0, parseInt(scoreMatch[1]))) : 50;
    let riskCategory = 'Moderate';
    if (riskScore <= 25) riskCategory = 'Low';
    else if (riskScore <= 50) riskCategory = 'Moderate';
    else if (riskScore <= 75) riskCategory = 'Elevated';
    else riskCategory = 'High';
    return { riskScore, riskCategory, analysis: content };
  } catch (err) {
    console.error('Groq API error:', err.response?.data || err.message);
    return {
      riskScore: 50,
      riskCategory: 'Moderate',
      analysis: 'AI analysis temporarily unavailable. Risk level elevated based on sentiment and volatility indicators.'
    };
  }
}

/** Short digest of data file freshness (cron / scraper outputs) for AI guide context */
function buildSiteDataDigest() {
  const lines = [];
  const watch = [
    ['dividend_calendar', path.join(DATA_PATH, 'dividends', 'psx_dividend_calendar.csv')],
    ['daily_prices', path.join(DATA_PATH, 'prices', 'daily_prices.csv')],
    ['psx_full_dataset', path.join(DATA_PATH, 'prices', 'psx_full_dataset.csv')],
    ['daily_news', path.join(DATA_PATH, 'news', 'daily_news.csv')],
    ['ai_commentary', path.join(DATA_PATH, 'news', 'ai_commentary.csv')],
    ['nccpl_risk_metrics', path.join(DATA_PATH, 'risk', 'nccpl_risk_metrics.csv')],
    ['reporting_cycles', path.join(DATA_PATH, 'financials', 'psx_quarter_cycles.csv')],
  ];
  for (const [label, fp] of watch) {
    if (fs.existsSync(fp)) {
      lines.push(`${label}: last modified ${fs.statSync(fp).mtime.toISOString()}`);
    } else {
      lines.push(`${label}: (file not present)`);
    }
  }
  return lines.join('\n');
}

/** Groq chat model (override on Render if Groq deprecates defaults). */
const GROQ_MODEL = (process.env.GROQ_MODEL || 'llama-3.1-8b-instant').trim();

function getGroqKey() {
  const k = (process.env.GROQ_API_KEY || '').trim();
  if (!k || k === 'your_api_key_here') return null;
  return k;
}

/** Plain-language cause when Groq HTTP fails (no secrets). */
function groqHttpErrorMessage(err) {
  const status = err.response?.status;
  const body = err.response?.data;
  const groqErr = body?.error?.message || body?.message || '';
  const low = String(groqErr).toLowerCase();
  if (status === 401) {
    return 'Groq returned 401 (invalid API key). In Render → dividendflow-backend → Environment: set GROQ_API_KEY exactly as from console.groq.com (no quotes, no spaces), then redeploy.';
  }
  if (status === 403) {
    return 'Groq returned 403 (forbidden). Check the key and project settings on console.groq.com.';
  }
  if (status === 429) {
    return 'Groq rate limit (429). Wait a minute or check quotas on console.groq.com.';
  }
  if (status === 400 && (low.includes('model') || low.includes('decommission') || low.includes('invalid'))) {
    const hint = groqErr ? ` ${groqErr.slice(0, 160)}` : '';
    return `Groq rejected the request (400).${hint} You can set GROQ_MODEL on the backend to a current model from console.groq.com/docs/models.`;
  }
  if (err.code === 'ECONNABORTED' || String(err.message || '').toLowerCase().includes('timeout')) {
    return 'Groq request timed out. Try again; slow or unstable mobile data can cause this.';
  }
  if (!err.response) {
    return 'No response from Groq (network or DNS). Render may be unable to reach api.groq.com — retry or check Render / Groq status pages.';
  }
  return `Groq error (${status || 'unknown'}). Try again shortly.`;
}

const guideRateByIp = new Map();
const GUIDE_MIN_INTERVAL_MS = 2200;

async function groqAmmarGuide(systemPrompt, userContent) {
  const apiKey = getGroqKey();
  if (!apiKey) {
    return {
      ok: false,
      message:
        'I need a Groq API key on the server (GROQ_API_KEY) before I can explain the page in real time. Your toggle is on — once the backend is configured, try again.',
    };
  }
  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        max_tokens: 240,
        temperature: 0.35,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 32000,
      }
    );
    const text = (response.data.choices[0]?.message?.content || '').trim();
    return {
      ok: true,
      message: text || "I'm Ammar — pause on any widget and I'll walk you through it.",
    };
  } catch (err) {
    console.error('Groq Ammar guide error:', err.response?.status, err.response?.data || err.message);
    return {
      ok: false,
      message: groqHttpErrorMessage(err),
    };
  }
}

// ============ API ROUTES ============

// Load latest price per company from price CSVs (Company+Price and symbol+close shapes)
async function getLatestPrices() {
  const pricesPath = path.join(DATA_PATH, 'prices');
  const latest = new Map();
  if (!fs.existsSync(pricesPath)) return latest;
  const files = fs.readdirSync(pricesPath).filter(f => f.endsWith('.csv'));

  function ingestRow(company, price, date) {
    const c = (company || '').trim();
    const p = typeof price === 'number' ? price : parseFloat(String(price || '').replace(/,/g, ''));
    const d = (date || '').trim();
    if (!c || !Number.isFinite(p) || p <= 0) return;
    const existing = latest.get(c);
    if (!existing || (d && (!existing.date || d > existing.date))) {
      latest.set(c, { price: p, date: d });
    }
  }

  for (const file of files) {
    const rows = await readCSV(path.join(pricesPath, file));
    if (!rows.length) continue;
    const keys = Object.keys(rows[0]);
    const dateKey = keys.find((k) => /^date$/i.test(k));
    const companyKey = keys.find((k) => /^company$/i.test(k));
    const symbolKey = keys.find((k) => /^symbol$/i.test(k));
    const priceKey = keys.find((k) => /^price$/i.test(k));
    const closeKey = keys.find((k) => /^close$/i.test(k));

    // daily_prices.csv, price_changes.csv: Company + Price
    if (companyKey && priceKey) {
      for (const r of rows) {
        const company = (r[companyKey] || '').trim();
        const price = parseFloat(String(r[priceKey] || '').replace(/,/g, ''));
        const date = dateKey ? String(r[dateKey] || '').trim() : '';
        ingestRow(company, price, date);
      }
      continue;
    }

    // psx_full_dataset.csv: symbol + close (was previously skipped — no "Company"/"Price" columns)
    if (symbolKey && closeKey) {
      for (const r of rows) {
        const company = (r[symbolKey] || '').trim();
        const price = parseFloat(String(r[closeKey] || '').replace(/,/g, ''));
        const date = dateKey ? String(r[dateKey] || '').trim() : '';
        ingestRow(company, price, date);
      }
    }
  }
  return latest;
}

/** YYYY-MM-DD minus N calendar days (UTC). */
function subtractDaysIso(isoDateStr, days) {
  if (!isoDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(isoDateStr)) return null;
  const [y, m, d] = isoDateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - days);
  return dt.toISOString().slice(0, 10);
}

/** Latest close on or before `targetDate` (and on/before sessionDate) per symbol from daily_prices.csv */
async function buildWeekAgoPriceMap(sessionDateStr) {
  const map = new Map();
  const dailyPath = path.join(DATA_PATH, 'prices', 'daily_prices.csv');
  if (!sessionDateStr || !fs.existsSync(dailyPath)) return map;

  const targetStr = subtractDaysIso(sessionDateStr, 7);
  if (!targetStr) return map;

  const rows = await readCSV(dailyPath);
  const bySymbol = new Map();
  for (const r of rows) {
    const sym = (r.Company || r.company || '').trim();
    const ds = (r.Date || r.date || '').trim();
    const p = parseFloat(String(r.Price || r.price || '').replace(/,/g, ''));
    if (!sym || !ds || !(p > 0)) continue;
    if (!bySymbol.has(sym)) bySymbol.set(sym, []);
    bySymbol.get(sym).push({ d: ds, p });
  }

  for (const [sym, arr] of bySymbol) {
    let bestP = null;
    let bestD = '';
    for (const { d, p } of arr) {
      if (d > sessionDateStr) continue;
      if (d <= targetStr && (!bestD || d.localeCompare(bestD) > 0)) {
        bestD = d;
        bestP = p;
      }
    }
    if (bestP != null) map.set(sym.toUpperCase(), bestP);
  }
  return map;
}

/**
 * Heuristic label from ~7d return + NCCPL VaR/haircut. Not investment advice.
 * Good buy: solid week, clearing risk not extreme.
 * Safe buy: calmer week + lower VaR.
 * Risk buy: strong week with elevated margin risk, or very hot week, or weak week with stress.
 */
function classifyBuySignal(weekChgPct, varVal, haircutVal) {
  if (weekChgPct == null || Number.isNaN(weekChgPct)) {
    return { buySignal: '—', buySignalDetail: 'Add daily price history (7d) to classify.' };
  }
  const v = varVal != null && varVal > 0 ? varVal : null;
  const h = haircutVal != null && haircutVal > 0 ? haircutVal : null;
  const highRisk = (v != null && v >= 26) || (h != null && h >= 38);
  const lowRisk = v != null && v <= 18 && (h == null || h <= 32);

  if (weekChgPct >= 5 && highRisk) {
    return {
      buySignal: 'Risk buy',
      buySignalDetail: `Week ${weekChgPct >= 0 ? '+' : ''}${weekChgPct.toFixed(1)}% with elevated VaR/haircut (NCCPL).`,
    };
  }
  if (weekChgPct >= 8) {
    return {
      buySignal: 'Risk buy',
      buySignalDetail: `Week +${weekChgPct.toFixed(1)}% — strong move; often higher volatility.`,
    };
  }
  if (weekChgPct >= 3 && v != null && v <= 25 && (h == null || h < 38)) {
    return {
      buySignal: 'Good buy',
      buySignalDetail: `Week +${weekChgPct.toFixed(1)}% with moderate NCCPL risk.`,
    };
  }
  if (weekChgPct > -2.5 && weekChgPct < 5 && lowRisk) {
    return {
      buySignal: 'Safe buy',
      buySignalDetail: `Week ${weekChgPct >= 0 ? '+' : ''}${weekChgPct.toFixed(1)}%, lower VaR — steadier profile.`,
    };
  }
  if (weekChgPct >= 1 && weekChgPct < 5 && v != null && v <= 22) {
    return {
      buySignal: 'Safe buy',
      buySignalDetail: `Week +${weekChgPct.toFixed(1)}%, contained VaR.`,
    };
  }
  if (weekChgPct <= -3 || highRisk) {
    return {
      buySignal: 'Risk buy',
      buySignalDetail:
        weekChgPct <= -3
          ? `Week ${weekChgPct.toFixed(1)}% — weaker tape; higher uncertainty.`
          : `Elevated clearing risk (VaR/haircut) vs week ${weekChgPct >= 0 ? '+' : ''}${weekChgPct.toFixed(1)}%.`,
    };
  }
  if (weekChgPct >= 2) {
    return { buySignal: 'Good buy', buySignalDetail: `Week +${weekChgPct.toFixed(1)}%.` };
  }
  return {
    buySignal: 'Safe buy',
    buySignalDetail: `Week ${weekChgPct >= 0 ? '+' : ''}${weekChgPct.toFixed(1)}% — neutral-to-soft risk read.`,
  };
}

// Infer Interim vs Final from Fiscal_Year_End and Payment_month
function inferDividendType(company, paymentMonth, cyclesMap) {
  const cycle = cyclesMap.get(company);
  const fyEnd = (cycle?.Fiscal_Year_End || cycle?.fiscal_year_end || '').toLowerCase();
  const pm = parseInt(paymentMonth || 0);
  if (!pm) return 'Interim';
  if (fyEnd.includes('december')) {
    if (pm === 4) return 'Final';
    if (pm === 10) return 'Interim';
    if (pm >= 1 && pm <= 4) return 'Final';
    return 'Interim';
  }
  if (fyEnd.includes('june')) {
    if (pm === 10) return 'Final';
    if (pm === 4) return 'Interim';
    if (pm >= 7 && pm <= 10) return 'Final';
    return 'Interim';
  }
  return pm === 10 ? 'Final' : pm === 4 ? 'Interim' : 'Interim';
}

/** PSX payout text e.g. 100%(I) (D) or 2160%(F) (D) */
function inferDividendTypeFromAnnouncement(ann) {
  const s = String(ann || '').toUpperCase();
  if (/\(F\)/.test(s) || /\bFINAL\b/.test(s)) return 'Final';
  if (/\(I+\)/.test(s) || /\bINTERIM\b/.test(s)) return 'Interim';
  return null;
}

/** Rough DPS from "% of par" style (many PSX names use Rs 10 face): pct/100 * 10 */
function parseDpsFromAnnouncement(ann) {
  const m = String(ann || '').match(/^([\d,.]+)\s*%/);
  if (!m) return 0;
  const pct = parseFloat(m[1].replace(/,/g, ''));
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  const guess = Math.round((pct / 100) * 10 * 10000) / 10000;
  return guess > 0 && guess < 5000 ? guess : 0;
}

const PAYOUTS_FULL_MIN_ROWS = parseInt(process.env.PAYOUTS_FULL_MIN_ROWS || '120', 10);

// Enrich dividends with latest prices, recalculated yields, and Interim/Final type
async function getEnrichedDividends() {
  const calendarPath = path.join(DATA_PATH, 'dividends', 'psx_dividend_calendar.csv');
  const payoutsPath = path.join(DATA_PATH, 'dividends', 'psx_payouts.csv');
  const calendarRows = await readCSV(calendarPath);
  const payoutRows = await readCSV(payoutsPath);

  const latestPrices = await getLatestPrices();
  let cyclesMap = new Map();
  try {
    const cycles = await readCSV(path.join(DATA_PATH, 'financials', 'psx_quarter_cycles.csv'));
    cycles.forEach(c => cyclesMap.set((c.Company || c.company || '').trim(), c));
  } catch (_) {}

  // Lookup calendar rows by company (and prefer same payment month)
  const calendarsByCompany = new Map();
  for (const d of calendarRows) {
    const c = (d.Company || d.company || '').trim();
    if (!c) continue;
    if (!calendarsByCompany.has(c)) calendarsByCompany.set(c, []);
    calendarsByCompany.get(c).push(d);
  }

  function pickCalendarRow(company, paymentMonth) {
    const list = calendarsByCompany.get(company);
    if (!list || !list.length) return null;
    const pm = parseInt(paymentMonth || 0);
    const same = list.find(r => parseInt(r.Payment_month || r.payment_month || 0) === pm);
    return same || list[0];
  }

  function enrichCalendarRow(d) {
    const company = (d.Company || d.company || '').trim();
    const divPerShare = parseFloat(d.Dividend_per_share || d.dividend_per_share || 0);
    const csvPrice = parseFloat(d.Price || d.price || 0);
    const csvYield = parseFloat(d.Dividend_yield || d.dividend_yield || 0);
    const lp = latestPrices.get(company);
    const price = lp?.price > 0 ? lp.price : csvPrice;
    const yieldVal = price > 0 && divPerShare > 0
      ? Math.round((divPerShare / price) * 10000) / 100
      : csvYield;
    const type = inferDividendType(company, d.Payment_month || d.payment_month, cyclesMap);
    return { ...d, Price: price, Dividend_yield: yieldVal, dividend_yield: yieldVal, Type: type, dividendType: type };
  }

  // Full PSX payouts list (paginated scrape) drives calendar + weak-month counts when large enough
  const payoutHasRichCols = payoutRows.some(
    (r) =>
      (r.Dividend_announcement != null && String(r.Dividend_announcement).trim() !== '') ||
      (r.Book_closure != null && String(r.Book_closure).trim() !== '')
  );
  const useFullPayouts = payoutRows.length >= PAYOUTS_FULL_MIN_ROWS && payoutHasRichCols;

  if (!useFullPayouts) {
    return calendarRows.map(enrichCalendarRow);
  }

  return payoutRows
    .filter((p) => (p.Company || p.company || '').trim())
    .map((p) => {
      const company = (p.Company || p.company || '').trim();
      const paymentMonth = parseInt(p.Payment_month || p.payment_month || 0);
      const year = parseInt(p.Year || p.year || new Date().getFullYear());
      const ann = p.Dividend_announcement || p.dividend_announcement || '';
      const cal = pickCalendarRow(company, paymentMonth);
      let divPerShare = parseFloat(cal?.Dividend_per_share || cal?.dividend_per_share || 0);
      if (!divPerShare) divPerShare = parseDpsFromAnnouncement(ann);
      const csvPrice = parseFloat(cal?.Price || cal?.price || 0);
      const csvYield = parseFloat(cal?.Dividend_yield || cal?.dividend_yield || 0);
      const lp = latestPrices.get(company);
      const price = lp?.price > 0 ? lp.price : csvPrice;
      const yieldVal = price > 0 && divPerShare > 0
        ? Math.round((divPerShare / price) * 10000) / 100
        : csvYield;
      const fromAnn = inferDividendTypeFromAnnouncement(ann);
      const type = fromAnn || inferDividendType(company, paymentMonth, cyclesMap);
      const sector = (p.Sector || p.sector || cal?.Sector || cal?.sector || '').trim() || 'Other';
      return {
        Company: company,
        company,
        CompanyName: p.CompanyName || p.companyName || '',
        Sector: sector,
        Dividend_per_share: divPerShare || '',
        Payment_month: paymentMonth,
        payment_month: paymentMonth,
        Year: year,
        year,
        Book_closure: p.Book_closure || p.book_closure || '',
        Dividend_announcement: ann,
        Announcement_date: p.Announcement_date || p.announcement_date || '',
        BookClosureEnd: p.BookClosureEnd || p.bookClosureEnd || '',
        Price: price,
        Dividend_yield: yieldVal,
        dividend_yield: yieldVal,
        Type: type,
        dividendType: type,
      };
    });
}

// GET /api/dividends - Dividend calendar data (yields recalculated from latest prices)
app.get('/api/dividends', async (req, res) => {
  try {
    const data = await getEnrichedDividends();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/month-coverage - Monthly dividend coverage for Weak Month Optimizer
app.get('/api/month-coverage', async (req, res) => {
  try {
    const dividends = await getEnrichedDividends();
    const monthCoverage = {};
    for (let m = 1; m <= 12; m++) monthCoverage[m] = { companies: [], totalYield: 0, count: 0 };
    
    dividends.forEach(d => {
      const month = parseInt(d.Payment_month || d.payment_month || 0);
      if (month >= 1 && month <= 12) {
        const yieldVal = parseFloat(d.Dividend_yield || d.dividend_yield || 0);
        monthCoverage[month].companies.push(d.Company || d.company);
        monthCoverage[month].totalYield += yieldVal;
        monthCoverage[month].count++;
      }
    });

    const weakMonths = [];
    const avgCount = dividends.length > 0 ? dividends.length / 12 : 0;
    const strongMonths = [4, 10].map(m => monthCoverage[m].companies).flat();
    const suggestFromStrong = [...new Set(strongMonths)].slice(0, 8);
    for (let m = 1; m <= 12; m++) {
      if (monthCoverage[m].count < avgCount * 0.5) {
        weakMonths.push({
          month: m,
          monthName: new Date(2000, m - 1).toLocaleString('default', { month: 'long' }),
          count: monthCoverage[m].count,
          companies: monthCoverage[m].companies,
          suggestCompanies: monthCoverage[m].companies.length > 0 ? monthCoverage[m].companies : suggestFromStrong
        });
      }
    }

    res.json({ monthCoverage, weakMonths, dividends });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/risk-score - AI adverse media analysis
app.post('/api/risk-score', async (req, res) => {
  try {
    const { companyName } = req.body;
    const headlines = await getCompanyNews(companyName);
    const headlinesText = headlines.length > 0 
      ? headlines.slice(0, 10).join('\n- ')
      : 'No recent news headlines available for this company.';
    
    const prompt = `Analyze the following financial news headlines about ${companyName}.
Headlines:
- ${headlinesText}

Evaluate governance risk, regulatory issues, financial stress, and sentiment.
Provide a risk score from 0 to 100 (0=safest, 100=highest risk).
Categories: 0-25 Low, 26-50 Moderate, 51-75 Elevated, 76-100 High.
Do NOT give buy/sell recommendations. Only analytical insights.
Format: Start with "Risk Score: X" then provide brief analysis.`;

    const result = await analyzeWithGroq(prompt);
    res.json({ companyName, ...result, headlinesUsed: headlines.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/forecast - Price forecast with technical indicators (uses latest closing price)
// ?company=HBL&asOf=2026-03-10 (optional: forecast as of specific date)
app.get('/api/forecast', async (req, res) => {
  try {
    const { company, asOf } = req.query;
    const pricesPath = path.join(DATA_PATH, 'prices');
    const dividendsPath = path.join(DATA_PATH, 'dividends', 'psx_dividend_calendar.csv');
    let priceData = [];

    if (fs.existsSync(pricesPath)) {
      const files = fs.readdirSync(pricesPath).filter(f => f.endsWith('.csv'));
      for (const file of files) {
        const data = await readCSV(path.join(pricesPath, file));
        priceData = priceData.concat(data.map(d => ({
          ...d,
          _date: d.Date || d.date || d.Date || '',
          _price: parseFloat(d.Price || d.price || d.Close || d.close || 0),
          _company: (d.Company || d.company || '').trim()
        })));
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    
    // Load psx_full_dataset.csv for most recent prices (from psx.py GitHub Actions)
    const fullDatasetPath = path.join(pricesPath, 'psx_full_dataset.csv');
    if (fs.existsSync(fullDatasetPath)) {
      const fullData = await readCSV(fullDatasetPath);
      fullData.forEach(d => {
        const c = (d.symbol || d.Symbol || d.Company || d.company || '').trim();
        const p = parseFloat(d.close || d.Close || d.Price || d.price || 0);
        const dt = d.date || d.Date || today;
        if (c && p > 0) {
          priceData.push({ _company: c, _price: p, _date: dt });
        }
      });
    }
    
    // Fallback to dividend calendar prices if no price data yet
    if (priceData.length === 0 && fs.existsSync(dividendsPath)) {
      const divData = await readCSV(dividendsPath);
      const seenDiv = new Set();
      divData.forEach(d => {
        const c = (d.Company || d.company || '').trim();
        const p = parseFloat(d.Price || d.price || 0);
        if (c && p > 0 && !seenDiv.has(c)) {
          seenDiv.add(c);
          priceData.push({ _company: c, _price: p, _date: today });
        }
      });
    }

    const search = (company || '').toLowerCase();
    let filtered = search ? priceData.filter(d => d._company.toLowerCase() === search) : priceData;
    
    // Fallback to partial match if no exact match found
    if (filtered.length === 0 && search) {
      filtered = priceData.filter(d => d._company.toLowerCase().includes(search));
    }
    let filteredByDate = filtered;
    if (asOf) {
      filteredByDate = filtered.filter(d => (d._date || '') <= asOf);
    }
    const byDate = new Map();
    (filteredByDate.length > 0 ? filteredByDate : filtered)
      .filter(d => d._price > 0)
      .forEach(d => {
        const dt = d._date || '';
        byDate.set(dt, d);
      });
    const sorted = [...byDate.values()].sort((a, b) => (a._date || '').localeCompare(b._date || ''));

    if (sorted.length === 0) {
      return res.json({
        company: company || 'Sample',
        lowCase: 0, baseCase: 0, highCase: 0,
        rsi: 50, macd: 0, volatility: 0, lastPrice: 0, asOfDate: null,
        message: 'Insufficient price data for this company. Add CSV files to data/prices/ or ensure dividend calendar has Price.'
      });
    }

    const prices = sorted.map(d => d._price).slice(-50);
    const lastPrice = prices[prices.length - 1] || 100;
    const asOfDate = sorted[sorted.length - 1]._date || today;
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length || lastPrice;
    const volatility = prices.length > 1
      ? Math.sqrt(prices.reduce((s, p) => s + Math.pow(p - avgPrice, 2), 0) / prices.length) / avgPrice * 100
      : 10;

    const lowCase = lastPrice * (1 - volatility / 100);
    const baseCase = lastPrice;
    const highCase = lastPrice * (1 + volatility / 100);

    res.json({
      company: company || 'Sample',
      lowCase: Math.round(lowCase * 100) / 100,
      baseCase: Math.round(baseCase * 100) / 100,
      highCase: Math.round(highCase * 100) / 100,
      rsi: 50,
      macd: 0,
      volatility: Math.round(volatility * 100) / 100,
      lastPrice: Math.round(lastPrice * 100) / 100,
      asOfDate
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/salary-simulator - Salary replacement calculator
app.post('/api/salary-simulator', async (req, res) => {
  try {
    const { targetMonthlyIncome, expectedDividendYield } = req.body;
    const monthly = parseFloat(targetMonthlyIncome) || 0;
    const yieldPct = parseFloat(expectedDividendYield) || 0;
    
    if (monthly <= 0 || yieldPct <= 0) {
      return res.status(400).json({ error: 'Invalid inputs. Provide targetMonthlyIncome and expectedDividendYield.' });
    }

    const annualIncome = monthly * 12;
    const requiredPortfolio = (annualIncome / (yieldPct / 100));
    const yearsToIndependence = 15;

    res.json({
      targetMonthlyIncome: monthly,
      expectedDividendYield: yieldPct,
      requiredPortfolioValue: Math.round(requiredPortfolio * 100) / 100,
      estimatedYearsToDividendIndependence: yearsToIndependence,
      annualDividendAtTarget: annualIncome
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reporting-cycles - PSX reporting cycle data
app.get('/api/reporting-cycles', async (req, res) => {
  try {
    const data = await readCSV(path.join(DATA_PATH, 'financials', 'psx_quarter_cycles.csv'));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/capital-gain - Blended return estimator
app.get('/api/capital-gain', async (req, res) => {
  try {
    const { company } = req.query;
    const dividends = await readCSV(path.join(DATA_PATH, 'dividends', 'psx_dividend_calendar.csv'));
    const divYield = dividends
      .filter(d => !company || (d.Company || d.company || '').toLowerCase().includes((company || '').toLowerCase()))
      .reduce((sum, d) => sum + parseFloat(d.Dividend_yield || d.dividend_yield || 0), 0) / (dividends.length || 1);
    
    const appreciationLow = 2;
    const appreciationBase = 8;
    const appreciationHigh = 15;

    res.json({
      company: company || 'Portfolio',
      dividendYield: Math.round(divYield * 100) / 100,
      conservative: { dividend: divYield, appreciation: appreciationLow, blended: divYield + appreciationLow },
      base: { dividend: divYield, appreciation: appreciationBase, blended: divYield + appreciationBase },
      optimistic: { dividend: divYield, appreciation: appreciationHigh, blended: divYield + appreciationHigh }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Compute latest vs previous price changes from daily_prices.csv (uses two most recent dates)
async function computePriceChangesFromDailyPrices() {
  const dailyPath = path.join(DATA_PATH, 'prices', 'daily_prices.csv');
  if (!fs.existsSync(dailyPath)) return [];
  const rows = await readCSV(dailyPath);
  const byCompanyDate = new Map(); // "Company|Date" -> price
  const dates = new Set();
  for (const r of rows) {
    const company = (r.Company || r.company || '').trim();
    const date = (r.Date || r.date || '').trim();
    const price = parseFloat(r.Price || r.price || 0);
    if (company && date && price > 0) {
      byCompanyDate.set(`${company}|${date}`, price);
      dates.add(date);
    }
  }
  const sortedDates = [...dates].sort().reverse();
  if (sortedDates.length < 1) return [];
  const latestDate = sortedDates[0];
  const prevDate = sortedDates.length >= 2 ? sortedDates[1] : null;
  let prevPrices = new Map();
  if (prevDate) {
    for (const r of rows) {
      const company = (r.Company || r.company || '').trim();
      const price = parseFloat(r.Price || r.price || 0);
      if (company && (r.Date || r.date) === prevDate && price > 0) prevPrices.set(company, price);
    }
  }
  if (prevPrices.size === 0 && prevDate === null) {
    const divPath = path.join(DATA_PATH, 'dividends', 'psx_dividend_calendar.csv');
    if (fs.existsSync(divPath)) {
      const divRows = await readCSV(divPath);
      const seen = new Set();
      for (const d of divRows) {
        const c = (d.Company || d.company || '').trim();
        const p = parseFloat(d.Price || d.price || 0);
        if (c && p > 0 && !seen.has(c)) {
          prevPrices.set(c, p);
          seen.add(c);
        }
      }
    }
  }
  const changes = [];
  const seen = new Set();
  for (const r of rows) {
    const company = (r.Company || r.company || '').trim();
    if (!company || seen.has(company)) continue;
    const priceLatest = byCompanyDate.get(`${company}|${latestDate}`);
    const pricePrev = prevPrices.get(company);
    if (!priceLatest || !pricePrev || pricePrev <= 0) continue;
    seen.add(company);
    const change = priceLatest - pricePrev;
    const changePct = (change / pricePrev) * 100;
    changes.push({
      Company: company,
      Price: Math.round(priceLatest * 100) / 100,
      PreviousPrice: Math.round(pricePrev * 100) / 100,
      Change: Math.round(change * 100) / 100,
      ChangePct: Math.round(changePct * 100) / 100,
      Date: latestDate,
    });
  }
  return changes.sort((a, b) => Math.abs(b.ChangePct) - Math.abs(a.ChangePct));
}

/** Same datasets as GET /api/daily-news — shared with market chatbot */
async function fetchDailyNewsPayload() {
  const newsPath = path.join(DATA_PATH, 'news');
  const pricesPath = path.join(DATA_PATH, 'prices');
  let news = [];
  let commentary = [];
  let priceChanges = [];
  let priceCommentary = [];
  if (fs.existsSync(path.join(newsPath, 'daily_news.csv'))) {
    news = await readCSV(path.join(newsPath, 'daily_news.csv'));
  }
  if (fs.existsSync(path.join(newsPath, 'ai_commentary.csv'))) {
    commentary = await readCSV(path.join(newsPath, 'ai_commentary.csv'));
  }
  priceChanges = await computePriceChangesFromDailyPrices();
  if (priceChanges.length === 0 && fs.existsSync(path.join(pricesPath, 'price_changes.csv'))) {
    priceChanges = await readCSV(path.join(pricesPath, 'price_changes.csv'));
  }
  const hasMeaningfulChanges = priceChanges.some(p => {
    const pct = parseFloat(p.ChangePct || p.changePct || p.Change_pct) || 0;
    return pct !== 0;
  });
  if (!hasMeaningfulChanges) {
    const fullPath = path.join(pricesPath, 'psx_full_dataset.csv');
    if (fs.existsSync(fullPath)) {
      const fullRows = await readCSV(fullPath);
      const parseNum = (s) => {
        if (!s) return 0;
        const v = String(s).replace(/,/g, '').replace('%', '').trim();
        return parseFloat(v) || 0;
      };
      const withChange = fullRows
        .map(r => ({
          Company: r.symbol || r.Symbol || '',
          Price: parseNum(r.close || r.Close),
          Change: parseNum(r.change || r.Change),
          ChangePct: parseNum(r.change_pct || r['change_pct']),
          Date: r.date || r.Date,
        }))
        .filter(x => x.Company && x.Price > 0 && x.ChangePct !== 0);
      if (withChange.length > 0) {
        priceChanges = withChange.sort((a, b) => Math.abs(b.ChangePct) - Math.abs(a.ChangePct));
      }
    }
  }
  if (fs.existsSync(path.join(newsPath, 'price_commentary.csv'))) {
    priceCommentary = await readCSV(path.join(newsPath, 'price_commentary.csv'));
  }
  return { news, commentary, priceChanges, priceCommentary };
}

function buildMarketChatContextText(payload) {
  const lines = [];
  const pc = payload.priceChanges || [];
  const parsePct = (r) => parseFloat(r.ChangePct || r.changePct || r.Change_pct) || 0;
  const gainers = [...pc].filter((r) => parsePct(r) > 0).sort((a, b) => parsePct(b) - parsePct(a)).slice(0, 15);
  const losers = [...pc].filter((r) => parsePct(r) < 0).sort((a, b) => parsePct(a) - parsePct(b)).slice(0, 15);
  lines.push('=== PRICE MOVES (latest automated scrape; not live intraday) ===');
  if (gainers.length === 0 && losers.length === 0) {
    lines.push('(No non-zero price changes in the current file.)');
  } else {
    gainers.forEach((r) => {
      lines.push(`UP: ${r.Company} +${parsePct(r)}%  date:${r.Date || ''}`);
    });
    losers.forEach((r) => {
      lines.push(`DOWN: ${r.Company} ${parsePct(r)}%  date:${r.Date || ''}`);
    });
  }
  lines.push('');
  lines.push('=== RECENT NEWS ROWS (headlines / text from daily_news.csv, last rows first) ===');
  const newsRows = (payload.news || []).slice(-35);
  newsRows.forEach((row) => {
    const flat = Object.entries(row)
      .map(([k, v]) => `${k}:${String(v).slice(0, 120)}`)
      .join(' | ');
    if (flat.trim()) lines.push(flat.slice(0, 400));
  });
  lines.push('');
  lines.push('=== AI COMMENTARY FILE (snippets) ===');
  (payload.commentary || []).slice(-12).forEach((row) => {
    const flat = Object.entries(row)
      .map(([k, v]) => `${k}:${String(v).slice(0, 160)}`)
      .join(' | ');
    if (flat.trim()) lines.push(flat.slice(0, 450));
  });
  lines.push('');
  lines.push('=== PRICE COMMENTARY FILE (snippets) ===');
  (payload.priceCommentary || []).slice(-10).forEach((row) => {
    const flat = Object.entries(row)
      .map(([k, v]) => `${k}:${String(v).slice(0, 160)}`)
      .join(' | ');
    if (flat.trim()) lines.push(flat.slice(0, 450));
  });
  return lines.join('\n').slice(0, 14000);
}

const chatRateByIp = new Map();
const CHAT_MIN_INTERVAL_MS = 5000;

async function groqMarketChat(systemPrompt, userBlock) {
  const apiKey = getGroqKey();
  if (!apiKey) {
    return { ok: false, reply: 'Chat needs GROQ_API_KEY on the server. Configure it on Render for dividendflow-backend.' };
  }
  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userBlock },
        ],
        max_tokens: 900,
        temperature: 0.35,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 32000,
      }
    );
    const text = (response.data.choices[0]?.message?.content || '').trim();
    return { ok: true, reply: text || 'I could not form an answer from the files just now. Try asking in simpler words.' };
  } catch (err) {
    console.error('Groq market chat error:', err.response?.status, err.response?.data || err.message);
    return { ok: false, reply: groqHttpErrorMessage(err) };
  }
}

// GET /api/daily-news - Scraped news + prices + AI commentary for PSX companies
app.get('/api/daily-news', async (req, res) => {
  try {
    const payload = await fetchDailyNewsPayload();
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/market-chat — Q&A from latest scrape + news files (Groq); heavy disclaimer
app.post('/api/market-chat', async (req, res) => {
  try {
    const rawIp = req.headers['x-forwarded-for'];
    const ip = typeof rawIp === 'string' ? rawIp.split(',')[0].trim() : rawIp?.[0] || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const prev = chatRateByIp.get(ip) || 0;
    if (now - prev < CHAT_MIN_INTERVAL_MS) {
      return res.status(429).json({
        ok: false,
        reply: 'Please wait a few seconds between questions so everyone can use the helper.',
      });
    }
    chatRateByIp.set(ip, now);

    const message = String(req.body?.message || '').trim().slice(0, 2000);
    if (!message) {
      return res.status(400).json({ ok: false, reply: 'Type a question first.' });
    }

    const payload = await fetchDailyNewsPayload();
    const dataBlock = buildMarketChatContextText(payload);
    const digest = buildSiteDataDigest();

    const systemPrompt = `You are "Market Buddy" on DividendFlow PK — a PSX-focused research helper used by retail users, analysts, and finance professionals.

Tone: clear, concise, professional. Plain English is fine; avoid childish metaphors. Short bullets when listing movers.

Rules you MUST follow:
1) ONLY use facts in the DATA block below. Never invent tickers, percentages, or headlines. If absent, say it does not appear in the current file.
2) Use probabilistic language ("may", "could", "headline suggests") — never "will", guaranteed returns, or explicit buy/sell/size orders.
3) You are not a licensed adviser; no personalized portfolio or tax guidance.
4) If the question is outside PSX or outside the supplied data, say you only summarize DividendFlow's archived scrape.
5) Prefer under ~200 words unless the user requests a longer list.

Data freshness (file mtimes on server — not live market data):
${digest}

End every reply with one line starting exactly: "Remember: " then one sentence: AI output from saved files only, not exhaustive or verified, not investment advice — verify with primary sources and a licensed professional before trading."`;

    const userBlock = `DATA FROM OUR LATEST SCRAPE (may be from last trading day; do not claim live prices):
---
${dataBlock}
---

USER QUESTION:
${message}`;

    const out = await groqMarketChat(systemPrompt, userBlock);
    res.json({
      ok: out.ok,
      reply: out.reply,
      disclaimer:
        'This reply is generated by AI from DividendFlow’s last saved news and price files. It is not a prediction, not 100% accurate, and not investment, legal, or tax advice. Markets change; always verify facts and talk to a qualified professional before investing.',
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      reply: err.message || 'Server error',
      disclaimer:
        'This tool is for learning only. It is not investment advice.',
    });
  }
});

// GET /api/market-closing-prices - Full PSX dataset from psx_full_dataset.csv + NCCPL VaR/haircut merge
app.get('/api/market-closing-prices', async (req, res) => {
  try {
    const fp = path.join(DATA_PATH, 'prices', 'psx_full_dataset.csv');
    if (!fs.existsSync(fp)) {
      return res.json({ rows: [], date: null, summary: null, riskAsOf: null, buySignalNote: null });
    }
    const rows = await readCSV(fp);
    const date = rows[0]?.date || rows[0]?.Date || null;
    const parseNum = (s) => {
      if (!s) return 0;
      const v = String(s).replace(/,/g, '').replace('%', '').trim();
      return parseFloat(v) || 0;
    };

    const riskFile = path.join(DATA_PATH, 'risk', 'nccpl_risk_metrics.csv');
    const riskBySymbol = new Map();
    let riskAsOf = null;
    if (fs.existsSync(riskFile)) {
      const riskRows = await readCSV(riskFile);
      for (const r of riskRows) {
        const sym = (r.symbol || '').toUpperCase().trim();
        if (!sym) continue;
        const lu = (r.last_updated || '').trim();
        if (lu && (!riskAsOf || lu > riskAsOf)) riskAsOf = lu;
        riskBySymbol.set(sym, {
          var: parseFloat(r.var_value || 0) || null,
          haircut: parseFloat(r.haircut || 0) || null,
        });
      }
    }

    const parsed = rows.map(r => {
      const symbol = (r.symbol || r.Symbol || '').trim();
      const up = symbol.toUpperCase();
      const risk = riskBySymbol.get(up);
      return {
        symbol,
        company: symbol,
        close: parseNum(r.close || r.Close),
        change: parseNum(r.change || r.Change),
        changePct: parseNum(r.change_pct || r.ChangePct || r['change_pct']),
        volume: parseInt((r.volume || r.Volume || '0').toString().replace(/,/g, ''), 10) || 0,
        open: parseNum(r.open || r.Open),
        high: parseNum(r.high || r.High),
        low: parseNum(r.low || r.Low),
        var: risk && risk.var != null && risk.var > 0 ? Math.round(risk.var * 100) / 100 : null,
        haircut: risk && risk.haircut != null && risk.haircut > 0 ? Math.round(risk.haircut * 100) / 100 : null,
      };
    }).filter(x => x.symbol && x.close > 0);
    const weekAgoMap = await buildWeekAgoPriceMap(date);
    const withSignals = parsed.map((x) => {
      const up = x.symbol.toUpperCase();
      const w0 = weekAgoMap.get(up);
      let weekChgPct = null;
      if (w0 != null && w0 > 0 && x.close > 0) {
        weekChgPct = Math.round(((x.close - w0) / w0) * 10000) / 100;
      }
      const sig = classifyBuySignal(weekChgPct, x.var, x.haircut);
      return { ...x, weekChgPct, buySignal: sig.buySignal, buySignalDetail: sig.buySignalDetail };
    });

    const topGainer = withSignals.filter(p => p.changePct > 0).sort((a, b) => b.changePct - a.changePct)[0];
    const topLoser = withSignals.filter(p => p.changePct < 0).sort((a, b) => a.changePct - b.changePct)[0];
    const summary = {
      totalCompanies: withSignals.length,
      topGainer: topGainer ? { symbol: topGainer.symbol, changePct: topGainer.changePct } : null,
      topLoser: topLoser ? { symbol: topLoser.symbol, changePct: topLoser.changePct } : null,
      date,
    };
    res.json({
      rows: withSignals,
      date,
      summary,
      riskAsOf,
      buySignalNote:
        'Good buy / Safe buy / Risk buy are heuristic labels from ~7 calendar day change (daily_prices.csv) plus NCCPL VaR & haircut — not investment advice.',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai-site-guide — Groq “Ammar” contextual hints (cursor pause); uses live data digest
app.post('/api/ai-site-guide', async (req, res) => {
  try {
    const rawIp = req.headers['x-forwarded-for'];
    const ip = typeof rawIp === 'string' ? rawIp.split(',')[0].trim() : rawIp?.[0] || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const prev = guideRateByIp.get(ip) || 0;
    if (now - prev < GUIDE_MIN_INTERVAL_MS) {
      return res.status(429).json({
        ok: false,
        message: 'Hang on a beat — pause again in a second so I can keep up.',
      });
    }
    guideRateByIp.set(ip, now);

    const routePath = String(req.body?.path || '').slice(0, 256);
    const pageTitle = String(req.body?.pageTitle || '').slice(0, 220);
    const elementContext = String(req.body?.elementContext || '').slice(0, 2000);

    const digest = buildSiteDataDigest();
    const systemPrompt = `You are Ammar, the friendly on-site guide for DividendFlow PK — AI dividend intelligence for the Pakistan Stock Exchange (PSX). Your tagline is "Ammar — your guide."

Behavior:
- Reply in 2–4 short sentences, warm and clear, first person as Ammar.
- Use the "Site data freshness" lines below when the user asks about how current data is, or when it helps explain scrapers/cron updates.
- Describe what the user is likely looking at from the browser context. If context is thin, give a useful tip for their current route.
- Explain metrics (dividend yield, VaR, haircut, price change, calendar entries) in plain language.
- Do not give personalized buy/sell recommendations or promise returns. Remind that nothing here is investment advice.

Current route: ${routePath}
Document title: ${pageTitle}

Site data freshness (automated jobs write these files):
${digest}`;

    const userContent = `The user paused the cursor here. Say what this part of DividendFlow PK is and what it means.

Browser-reported context (may be truncated):
${elementContext}`;

    const out = await groqAmmarGuide(systemPrompt, userContent);
    res.json(out);
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message || 'Guide error' });
  }
});

// GET /api/data-status - Last updated timestamp for PSX data
app.get('/api/data-status', (req, res) => {
  try {
    const files = [
      path.join(DATA_PATH, 'dividends', 'psx_dividend_calendar.csv'),
      path.join(DATA_PATH, 'financials', 'psx_quarter_cycles.csv'),
      path.join(DATA_PATH, 'prices', 'psx_prices_sample.csv')
    ];
    let lastModified = 0;
    files.forEach(f => {
      if (fs.existsSync(f)) {
        const mtime = fs.statSync(f).mtimeMs;
        if (mtime > lastModified) lastModified = mtime;
      }
    });
    const date = new Date(lastModified || Date.now());
    res.json({
      lastUpdated: date.toISOString(),
      formatted: date.toLocaleString('en-PK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    });
  } catch (err) {
    res.json({ lastUpdated: new Date().toISOString(), formatted: new Date().toLocaleString() });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Risk Score Calculation Helper
function calculateRiskScore(varValue, haircut, volatility = null) {
  // Risk score formula based on NCCPL data
  if (volatility !== null && volatility > 0) {
    return (0.4 * varValue) + (0.3 * haircut) + (0.3 * volatility);
  }
  return (0.6 * varValue) + (0.4 * haircut);
}

function getRiskLabel(riskScore) {
  if (riskScore <= 8) return 'Low';
  if (riskScore <= 15) return 'Moderate';
  return 'High';
}

function getRiskInsight(riskLabel, varValue, haircut) {
  if (riskLabel === 'Low') {
    return `Low downside risk with ~${varValue}% VaR and ${haircut}% haircut. Suitable for conservative portfolios.`;
  } else if (riskLabel === 'Moderate') {
    return `Moderate downside risk with ~${varValue}% VaR and ${haircut}% haircut. Standard risk profile.`;
  } else {
    return `High downside risk with ~${varValue}% VaR and ${haircut}% haircut. Higher volatility expected.`;
  }
}

// GET /api/stock-risk/:symbol - Risk metrics for a specific stock
app.get('/api/stock-risk/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    const riskFile = path.join(DATA_PATH, 'risk', 'nccpl_risk_metrics.csv');
    if (!fs.existsSync(riskFile)) {
      return res.status(404).json({ error: 'Risk data not available' });
    }

    const riskData = await readCSV(riskFile);
    const searchSymbol = symbol.toUpperCase();
    const stockRisk = riskData.find(r => 
      (r.symbol || '').toUpperCase() === searchSymbol
    );

    if (!stockRisk) {
      return res.status(404).json({ error: 'Risk data not found for symbol' });
    }

    const varValue = parseFloat(stockRisk.var_value || 0);
    const haircut = parseFloat(stockRisk.haircut || 0);
    const week26Avg = parseFloat(stockRisk.week_26_avg || 0);
    const freeFloat = parseFloat(stockRisk.free_float || 0);
    const halfHourRate = parseFloat(stockRisk.half_hour_avg_rate || 0);
    
    // Calculate risk score (using week26Avg as volatility proxy if > 0)
    const volatility = week26Avg > 0 ? week26Avg : null;
    const riskScore = calculateRiskScore(varValue, haircut, volatility);
    const riskLabel = getRiskLabel(riskScore);
    const insight = getRiskInsight(riskLabel, varValue, haircut);

    res.json({
      symbol: searchSymbol,
      var: varValue,
      haircut: haircut,
      week_26_avg: week26Avg,
      free_float: freeFloat,
      half_hour_avg_rate: halfHourRate,
      risk_score: Math.round(riskScore * 100) / 100,
      risk_label: riskLabel,
      insight: insight,
      last_updated: stockRisk.last_updated || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stock-risk - All risk metrics
app.get('/api/stock-risk', async (req, res) => {
  try {
    const riskFile = path.join(DATA_PATH, 'risk', 'nccpl_risk_metrics.csv');
    if (!fs.existsSync(riskFile)) {
      return res.json({ stocks: [], summary: null });
    }

    const riskData = await readCSV(riskFile);
    const stocks = riskData.map(r => {
      const varValue = parseFloat(r.var_value || 0);
      const haircut = parseFloat(r.haircut || 0);
      const week26Avg = parseFloat(r.week_26_avg || 0);
      const volatility = week26Avg > 0 ? week26Avg : null;
      const riskScore = calculateRiskScore(varValue, haircut, volatility);
      const riskLabel = getRiskLabel(riskScore);

      return {
        symbol: (r.symbol || '').toUpperCase(),
        var: varValue,
        haircut: haircut,
        risk_score: Math.round(riskScore * 100) / 100,
        risk_label: riskLabel,
      };
    });

    const lowRisk = stocks.filter(s => s.risk_label === 'Low').length;
    const moderateRisk = stocks.filter(s => s.risk_label === 'Moderate').length;
    const highRisk = stocks.filter(s => s.risk_label === 'High').length;
    const avgVar = stocks.reduce((sum, s) => sum + s.var, 0) / stocks.length || 0;

    const summary = {
      total_stocks: stocks.length,
      low_risk_pct: Math.round((lowRisk / stocks.length) * 100),
      moderate_risk_pct: Math.round((moderateRisk / stocks.length) * 100),
      high_risk_pct: Math.round((highRisk / stocks.length) * 100),
      avg_var: Math.round(avgVar * 100) / 100,
    };

    res.json({ stocks, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`DividendFlow PK Backend running on http://localhost:${PORT}`);
  });
}

module.exports = app;
