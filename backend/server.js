require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const axios = require('axios');
const multer = require('multer');
const pdfParseModule = require('pdf-parse');
const {
  parsePaymentMonthNum,
  pickDividendPerShare,
} = require('./psxDividendParse');
const dataStore = require('./services/dataStore');
const { INVESTMENT_DISCLAIMER, MARKET_CLOSE_NOTICE } = require('./constants/disclaimer');
const v1Router = require('./routes/v1');
const aiPipeline = require('./services/aiPipeline');
const exchangeService = require('./services/exchangeService');
const exchangeNews = require('./services/exchangeNews');
const contactMail = require('./services/contactMail');

const app = express();
const PORT = process.env.PORT || 5000;
const DATA_PATH = path.join(__dirname, '..', 'data');
const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname?.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

app.use(cors());
app.use(express.json());
app.use('/api/v1', v1Router);

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

/** Read PSX dataset: Supabase when populated, else local CSV (backward compatible). */
async function readMarketCSV(relativePath) {
  const { rows } = await dataStore.readMarketData(relativePath, readCSV);
  return rows;
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

  const rows = await readMarketCSV('prices/daily_prices.csv');
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

const PAYOUTS_FULL_MIN_ROWS = parseInt(process.env.PAYOUTS_FULL_MIN_ROWS || '120', 10);

// Enrich dividends with latest prices, recalculated yields, and Interim/Final type
async function getEnrichedDividends() {
  const calendarPath = path.join(DATA_PATH, 'dividends', 'psx_dividend_calendar.csv');
  const payoutsPath = path.join(DATA_PATH, 'dividends', 'psx_payouts.csv');
  const calendarRows = await readMarketCSV('dividends/psx_dividend_calendar.csv');
  const payoutRows = await readMarketCSV('dividends/psx_payouts.csv');

  const latestPrices = await getLatestPrices();
  const companyNameBySymbol = new Map();
  for (const p of payoutRows) {
    const sym = (p.Company || p.company || '').trim();
    const name = (p.CompanyName || p.companyName || '').trim();
    if (sym && name) companyNameBySymbol.set(sym, name);
  }
  let cyclesMap = new Map();
  try {
    const cycles = await readMarketCSV('financials/psx_quarter_cycles.csv');
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
    const pm = parseInt(paymentMonth || 0, 10);
    const same = list.find(
      (r) => (parsePaymentMonthNum(r.Payment_month || r.payment_month) || 0) === pm
    );
    return same || list[0];
  }

  const latestAnnByCompany = new Map();
  for (const p of payoutRows) {
    const c = (p.Company || p.company || '').trim();
    if (!c) continue;
    const y = parseInt(p.Year || p.year || 0, 10);
    const m = parsePaymentMonthNum(p.Payment_month || p.payment_month) || 0;
    const prev = latestAnnByCompany.get(c);
    if (!prev || y > prev.y || (y === prev.y && m > prev.m)) {
      latestAnnByCompany.set(c, {
        y,
        m,
        ann: p.Dividend_announcement || p.dividend_announcement || '',
      });
    }
  }

  function enrichCalendarRow(d) {
    const company = (d.Company || d.company || '').trim();
    const annHint = latestAnnByCompany.get(company)?.ann || '';
    const picked = pickDividendPerShare({
      announcement: annHint,
      calendarDps: d.Dividend_per_share || d.dividend_per_share,
    });
    const divPerShare = picked.dps;
    const paymentMonth =
      parsePaymentMonthNum(d.Payment_month || d.payment_month) ||
      parseInt(d.Payment_month || d.payment_month || 0, 10) ||
      null;
    const csvPrice = parseFloat(d.Price || d.price || 0);
    const csvYield = parseFloat(d.Dividend_yield || d.dividend_yield || 0);
    const lp = latestPrices.get(company);
    const price = lp?.price > 0 ? lp.price : csvPrice;
    const yieldVal = price > 0 && divPerShare > 0
      ? Math.round((divPerShare / price) * 10000) / 100
      : csvYield;
    const type = inferDividendType(company, paymentMonth, cyclesMap);
    return {
      ...d,
      CompanyName: companyNameBySymbol.get(company) || d.CompanyName || d.companyName || '',
      Payment_month: paymentMonth || d.Payment_month,
      payment_month: paymentMonth || d.payment_month,
      Dividend_per_share: divPerShare,
      dividend_per_share: divPerShare,
      Price: price,
      Dividend_yield: yieldVal,
      dividend_yield: yieldVal,
      Type: type,
      dividendType: type,
      dps_source: picked.dpsSource,
      dps_par_value: picked.dpsParValue,
      calendar_dps_mismatch: picked.calendarDpsMismatch,
    };
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
      const paymentMonth = parsePaymentMonthNum(p.Payment_month || p.payment_month) || 0;
      const year = parseInt(p.Year || p.year || new Date().getFullYear());
      const ann = p.Dividend_announcement || p.dividend_announcement || '';
      const cal = pickCalendarRow(company, paymentMonth);
      const picked = pickDividendPerShare({
        announcement: ann,
        calendarDps: cal?.Dividend_per_share || cal?.dividend_per_share,
      });
      const divPerShare = picked.dps;
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
        dividend_per_share: divPerShare || '',
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
        dps_source: picked.dpsSource,
        dps_par_value: picked.dpsParValue,
        calendar_dps_mismatch: picked.calendarDpsMismatch,
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

const MONTH_NAMES_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function normalizePsxSymbol(sym) {
  return String(sym || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function getKnownPsxSymbols() {
  const dividends = await getEnrichedDividends();
  const set = new Set();
  for (const d of dividends) {
    const sym = normalizePsxSymbol(d.Company || d.company);
    if (sym) set.add(sym);
  }
  return [...set].sort();
}

async function getAllPsxSymbols() {
  const set = new Set(await getKnownPsxSymbols());
  const extraFiles = [
    path.join(DATA_PATH, 'prices', 'psx_full_dataset.csv'),
    path.join(DATA_PATH, 'dividends', 'psx_payouts.csv'),
  ];
  for (const fp of extraFiles) {
    if (!fs.existsSync(fp)) continue;
    try {
      const rows = await readCSV(fp);
      for (const r of rows) {
        const sym = normalizePsxSymbol(r.symbol || r.Symbol || r.Company || r.company);
        if (sym) set.add(sym);
      }
    } catch (_) {}
  }
  return [...set].sort();
}

const PDF_SKIP_SYMBOLS = new Set([
  'PSX', 'CDC', 'KSE', 'KSE100', 'USD', 'PKR', 'ETF', 'GDR', 'FUND', 'TOTAL', 'DATE', 'NA', 'NAV',
  'THE', 'AND', 'FOR', 'FROM', 'WITH', 'PAGE', 'REPORT', 'CLIENT', 'PORTFOLIO', 'POSITION', 'SYMBOL',
  'QTY', 'QUANTITY', 'BALANCE', 'AMOUNT', 'VALUE', 'COST', 'PRICE', 'SR', 'NO', 'ISIN',
]);

function isPlausibleShareCount(n) {
  return Number.isFinite(n) && n >= 1 && n <= 50_000_000 && !(n >= 1900 && n <= 2100);
}

function normalizePdfText(text) {
  return String(text)
    .replace(/\u00A0/g, ' ')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function mergeHoldingsLists(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const h of list || []) {
      const symbol = normalizePsxSymbol(h.symbol);
      const shares = parseFloat(h.shares) || 0;
      if (!symbol || !isPlausibleShareCount(shares)) continue;
      if (!map.has(symbol) || map.get(symbol) < shares) map.set(symbol, shares);
    }
  }
  return [...map.entries()].map(([symbol, shares]) => ({ symbol, shares }));
}

function tableRowExtractLineGeneric(line) {
  const parts = line.split(/\s+/).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    if (/^\d/.test(parts[i])) continue;
    const sym = normalizePsxSymbol(parts[i].replace(/[^A-Za-z0-9]/g, ''));
    if (!sym || sym.length < 2 || sym.length > 6 || PDF_SKIP_SYMBOLS.has(sym)) continue;
    for (const j of [i + 1, i - 1, i + 2, i + 3]) {
      if (j < 0 || j >= parts.length) continue;
      const n = parseFloat(String(parts[j]).replace(/,/g, ''));
      if (isPlausibleShareCount(n)) return { symbol: sym, shares: n };
    }
  }
  return null;
}

function tableRowExtractLine(line, symbolSet) {
  const parts = line.split(/\s+/).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i].replace(/[^A-Za-z0-9]/g, '');
    const sym = normalizePsxSymbol(raw);
    if (!sym || sym.length < 2 || sym.length > 6 || !symbolSet.has(sym) || PDF_SKIP_SYMBOLS.has(sym)) continue;
    for (const j of [i + 1, i - 1, i + 2, i + 3]) {
      if (j < 0 || j >= parts.length) continue;
      const n = parseFloat(String(parts[j]).replace(/,/g, ''));
      if (isPlausibleShareCount(n)) return { symbol: sym, shares: n };
    }
  }
  return null;
}

function brokerExtractHoldingsFromText(text, symbolSet) {
  const sorted = [...symbolSet].filter((s) => !PDF_SKIP_SYMBOLS.has(s)).sort((a, b) => b.length - a.length);
  const holdings = new Map();
  const lines = normalizePdfText(text).split('\n');
  let tableMode = false;

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (/\b(SYMBOL|SCRIP|CODE|TICKER)\b/.test(upper) && /\b(QTY|QUANTITY|BALANCE|HOLDING|SHARES|UNITS)\b/.test(upper)) {
      tableMode = true;
      continue;
    }
    if (tableMode) {
      const row = tableRowExtractLine(line, symbolSet);
      if (row) {
        holdings.set(row.symbol, Math.max(holdings.get(row.symbol) || 0, row.shares));
        continue;
      }
    }

    for (const sym of sorted) {
      const patterns = [
        new RegExp(`^${sym}\\b\\s*[-–—]?\\s*([\\d,]+(?:\\.\\d+)?)`, 'i'),
        new RegExp(`\\b${sym}\\b\\s*[-–—]?\\s*([\\d,]+(?:\\.\\d+)?)`, 'i'),
        new RegExp(`\\b${sym}\\b[^\\d]{0,24}([\\d,]+(?:\\.\\d+)?)`, 'i'),
        new RegExp(`([\\d,]+(?:\\.\\d+)?)\\s+${sym}\\b`, 'i'),
      ];
      for (const re of patterns) {
        const m = line.match(re);
        if (!m) continue;
        const shares = parseFloat(m[1].replace(/,/g, ''));
        if (isPlausibleShareCount(shares)) {
          holdings.set(sym, Math.max(holdings.get(sym) || 0, shares));
          break;
        }
      }
    }

    const row = tableRowExtractLine(line, symbolSet) || tableRowExtractLineGeneric(line);
    if (row) holdings.set(row.symbol, Math.max(holdings.get(row.symbol) || 0, row.shares));
  }

  return [...holdings.entries()].map(([symbol, shares]) => ({ symbol, shares }));
}

function regexExtractHoldingsFromText(text, knownSymbols) {
  const sorted = [...knownSymbols].filter((s) => !PDF_SKIP_SYMBOLS.has(s)).sort((a, b) => b.length - a.length);
  const holdings = new Map();
  const lines = normalizePdfText(text).split('\n');

  for (const line of lines) {
    const upper = line.toUpperCase();
    for (const sym of sorted) {
      if (!new RegExp(`\\b${sym}\\b`).test(upper)) continue;
      const nums = [...line.matchAll(/(\d[\d,]*(?:\.\d+)?)/g)]
        .map((m) => parseFloat(m[1].replace(/,/g, '')))
        .filter(isPlausibleShareCount);
      if (!nums.length) continue;
      const shares = Math.max(...nums);
      if (!holdings.has(sym) || holdings.get(sym) < shares) holdings.set(sym, shares);
    }
  }

  return [...holdings.entries()].map(([symbol, shares]) => ({ symbol, shares }));
}

async function groqExtractHoldingsFromText(pdfText, knownSymbols) {
  const apiKey = getGroqKey();
  if (!apiKey) return null;
  const sample = knownSymbols.slice(0, 150).join(', ');
  const prompt = `You parse Pakistan Stock Exchange (PSX) broker portfolio PDFs such as "Client Portfolio Position Report" or CDC statements.

Return ONLY valid JSON: {"holdings":[{"symbol":"HBL","shares":500}]}

Rules:
- symbol: PSX ticker only (2-6 uppercase letters), not company full name
- shares: current quantity / balance / units held (integer or decimal)
- Include every equity line; skip cash, margins, totals, headers, page numbers
- If the same symbol appears once, use the holding quantity (not market value)
- Max 60 holdings

Example tickers on PSX: ${sample}

PDF text:
${normalizePdfText(pdfText).slice(0, 18000)}`;

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2500,
        temperature: 0.05,
      },
      {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: 45000,
      }
    );
    const content = response.data.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    const list = Array.isArray(parsed.holdings) ? parsed.holdings : [];
    return list
      .map((h) => ({
        symbol: normalizePsxSymbol(h.symbol || h.Symbol || h.ticker || h.scrip || h.code),
        shares: parseFloat(h.shares ?? h.Shares ?? h.quantity ?? h.qty ?? h.balance ?? 0) || 0,
      }))
      .filter((h) => h.symbol && isPlausibleShareCount(h.shares));
  } catch (err) {
    console.error('Groq PDF holdings extract error:', err.response?.data || err.message);
    return null;
  }
}

async function extractHoldingsFromPdfText(text) {
  const normalized = normalizePdfText(text);
  const allSymbols = await getAllPsxSymbols();
  const dividendSymbols = await getKnownPsxSymbols();

  const groqHoldings = await groqExtractHoldingsFromText(normalized, allSymbols);
  const genericHoldings = brokerExtractHoldingsFromText(normalized, new Set(allSymbols));
  const regexHoldings = regexExtractHoldingsFromText(normalized, allSymbols.length ? allSymbols : dividendSymbols);
  const looseHoldings = (() => {
    const map = new Map();
    for (const line of normalized.split('\n')) {
      const row = tableRowExtractLineGeneric(line);
      if (row) map.set(row.symbol, Math.max(map.get(row.symbol) || 0, row.shares));
    }
    return [...map.entries()].map(([symbol, shares]) => ({ symbol, shares }));
  })();

  const holdings = mergeHoldingsLists(groqHoldings, genericHoldings, regexHoldings, looseHoldings);

  let method = 'merged';
  if (groqHoldings?.length && holdings.length === groqHoldings.length) method = 'groq';
  else if (genericHoldings?.length && !groqHoldings?.length) method = 'broker';

  return { holdings, method, knownSymbolCount: allSymbols.length, textLength: normalized.length };
}

async function computeDividendProjection(rawHoldings) {
  const holdings = (rawHoldings || [])
    .map((h) => ({
      symbol: normalizePsxSymbol(h.symbol || h.Symbol),
      shares: parseFloat(h.shares ?? h.Shares ?? 0) || 0,
    }))
    .filter((h) => h.symbol && h.shares > 0);

  const dividends = await getEnrichedDividends();
  const bySymbol = new Map();
  for (const d of dividends) {
    const sym = normalizePsxSymbol(d.Company || d.company);
    if (!sym) continue;
    if (!bySymbol.has(sym)) bySymbol.set(sym, []);
    bySymbol.get(sym).push(d);
  }

  const monthly = {};
  for (let m = 1; m <= 12; m++) monthly[m] = { amount: 0, items: [] };

  const lineItems = [];
  const matched = [];
  const unmatched = [];
  let totalAnnual = 0;

  for (const h of holdings) {
    const divRows = bySymbol.get(h.symbol);
    if (!divRows?.length) {
      unmatched.push({ symbol: h.symbol, shares: h.shares });
      continue;
    }

    let stockAnnual = 0;
    for (const d of divRows) {
      const month = parsePaymentMonthNum(d.Payment_month || d.payment_month);
      const dps = parseFloat(d.Dividend_per_share || d.dividend_per_share || 0);
      if (!month || dps <= 0) continue;
      const cash = Math.round(h.shares * dps * 100) / 100;
      stockAnnual += cash;
      totalAnnual += cash;
      monthly[month].amount = Math.round((monthly[month].amount + cash) * 100) / 100;
      const item = {
        symbol: h.symbol,
        sector: d.Sector || d.sector || '',
        shares: h.shares,
        paymentMonth: month,
        monthName: MONTH_NAMES_LONG[month - 1],
        dividendPerShare: dps,
        cash,
        type: d.Type || d.dividendType || 'Interim',
        year: parseInt(d.Year || d.year || new Date().getFullYear(), 10),
      };
      monthly[month].items.push(item);
      lineItems.push(item);
    }

    if (stockAnnual > 0) {
      matched.push({ symbol: h.symbol, shares: h.shares, annualDividend: Math.round(stockAnnual * 100) / 100 });
    } else {
      unmatched.push({ symbol: h.symbol, shares: h.shares, reason: 'No dividend rows with payment month in dataset' });
    }
  }

  const byMonth = [];
  for (let m = 1; m <= 12; m++) {
    byMonth.push({
      month: m,
      monthName: MONTH_NAMES_LONG[m - 1],
      amount: Math.round(monthly[m].amount * 100) / 100,
      items: monthly[m].items,
    });
  }

  return {
    holdings,
    totalAnnual: Math.round(totalAnnual * 100) / 100,
    byMonth,
    lineItems,
    matched,
    unmatched,
    disclaimer:
      'Projections use DividendFlow dividend calendar / PSX payout data and your share counts. Amounts are indicative only — not verified, not tax advice, and not a guarantee of future payouts.',
  };
}

/** pdf-parse v1 exports a function; v2 exports { PDFParse } class */
async function parsePdfBuffer(buffer) {
  if (typeof pdfParseModule === 'function') {
    const parsed = await pdfParseModule(buffer);
    return { text: parsed?.text || '', numpages: parsed?.numpages ?? null };
  }
  const { PDFParse } = pdfParseModule;
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const text = typeof result === 'string' ? result : (result?.text ?? '');
    return { text, numpages: result?.total ?? null };
  } finally {
    await parser.destroy?.();
  }
}

// POST /api/dividend-calculator — project dividend income from manual holdings
app.post('/api/dividend-calculator', async (req, res) => {
  try {
    const holdings = req.body?.holdings;
    if (!Array.isArray(holdings) || holdings.length === 0) {
      return res.status(400).json({ error: 'Provide holdings: [{ symbol, shares }, ...]' });
    }
    if (holdings.length > 80) {
      return res.status(400).json({ error: 'Maximum 80 holdings per request' });
    }
    const result = await computeDividendProjection(holdings);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dividend-calculator/pdf — parse portfolio PDF then project dividends
app.post('/api/dividend-calculator/pdf', (req, res, next) => {
  pdfUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Invalid PDF upload' });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ error: 'Upload a PDF portfolio statement (field name: file)' });
    }
    const parsed = await parsePdfBuffer(req.file.buffer);
    const text = parsed?.text || '';
    if (text.trim().length < 20) {
      return res.status(400).json({ error: 'Could not read text from PDF — try a text-based statement or enter holdings manually.' });
    }
    const { holdings, method, textLength } = await extractHoldingsFromPdfText(text);
    if (!holdings.length) {
      const hint =
        textLength < 200
          ? 'PDF text is too short — this may be a scanned/image PDF. Export a text-based statement from your broker or use manual entry.'
          : 'No PSX holdings detected in this PDF. Enter symbols manually or try a clearer statement export.';
      return res.status(422).json({
        error: hint,
        textPreview: text.slice(0, 600),
        textLength,
      });
    }
    const projection = await computeDividendProjection(holdings);
    res.json({
      ...projection,
      extractedHoldings: holdings,
      extractionMethod: method,
      pdfPages: parsed.numpages || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dividend-calculator/symbols — PSX tickers in dividend dataset (autocomplete)
app.get('/api/dividend-calculator/symbols', async (_req, res) => {
  try {
    const symbols = await getKnownPsxSymbols();
    res.json({ symbols });
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

function parseGroqJsonBlock(text) {
  const t = String(text || '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1].trim() : t;
  try {
    return JSON.parse(raw);
  } catch (_) {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch (e2) {
        return null;
      }
    }
    return null;
  }
}

async function buildDividendYieldContext(limit = 28) {
  const dividends = await getEnrichedDividends();
  const byCompany = new Map();
  for (const d of dividends) {
    const c = (d.Company || d.company || '').trim();
    const y = parseFloat(d.Dividend_yield || d.dividend_yield) || 0;
    if (!c || y <= 0) continue;
    const prev = byCompany.get(c);
    if (!prev || y > prev.yield) {
      byCompany.set(c, {
        symbol: c,
        yield: y,
        price: parseFloat(d.Price || d.price) || null,
        type: d.Type || d.dividendType || '',
      });
    }
  }
  return [...byCompany.values()]
    .sort((a, b) => b.yield - a.yield)
    .slice(0, limit);
}

const salaryAiRateByIp = new Map();
const SALARY_AI_MIN_INTERVAL_MS = 12000;

async function groqSalaryPortfolioAdvice({
  monthly,
  yieldPct,
  requiredPortfolio,
  shariahOnly,
}) {
  const apiKey = getGroqKey();
  if (!apiKey) {
    return {
      ok: false,
      error: 'GROQ_API_KEY is not set on the server. Add it in Render → dividendflow-backend → Environment.',
    };
  }

  let shariahSet = null;
  if (shariahOnly) {
    try {
      const shariahPath = path.join(DATA_PATH, 'reference', 'psx_shariah_compliant.json');
      if (fs.existsSync(shariahPath)) {
        const shariahData = JSON.parse(fs.readFileSync(shariahPath, 'utf-8'));
        shariahSet = new Set((shariahData.symbols || []).map((s) => String(s).toUpperCase()));
      }
    } catch (e) {
      console.warn('[Salary AI] Shariah list load failed:', e.message);
    }
  }

  let yieldRows = await buildDividendYieldContext(35);
  if (shariahSet && shariahSet.size > 0) {
    yieldRows = yieldRows.filter((r) => shariahSet.has(r.symbol.toUpperCase()));
  }

  const newsPayload = await fetchDailyNewsPayload();
  const marketBlock = buildMarketChatContextText(newsPayload);
  const digest = buildSiteDataDigest();

  const yieldLines = yieldRows.length
    ? yieldRows.map((r) => `${r.symbol}: indicated yield ~${r.yield}%  price:${r.price ?? 'n/a'}  type:${r.type || 'n/a'}`).join('\n')
    : '(No dividend yield rows in calendar files.)';

  const systemPrompt = `You are a PSX dividend-income research assistant on DividendFlow PK.

The user is building a hypothetical dividend portfolio to replace salary. You receive:
- Their target monthly income and required portfolio size (math already done).
- Top indicated dividend yields from DividendFlow's calendar CSVs (not live prices).
- Today's saved news and price-move scrape (may be last trading session).

Rules:
1) Respond with ONLY valid JSON (no markdown outside JSON) matching this schema:
{
  "suggestedNumberOfStocks": number (integer 5-12),
  "overview": "2-4 sentences on diversification and income focus",
  "todayMarketRead": "2-3 sentences tying news/movers to context — only facts from DATA",
  "holdings": [
    {
      "symbol": "PSX ticker",
      "weightPercent": number (0-100, all holdings should sum to ~100),
      "why": "one sentence — dividend + diversification rationale",
      "newsNote": "optional — only if supported in DATA, else empty string"
    }
  ],
  "cautions": ["bullet 1", "bullet 2"]
}
2) Pick symbols ONLY from the DIVIDEND YIELD LIST unless explaining why you cannot include a mover not on that list.
3) Use probabilistic language. No guaranteed returns. No "buy now" — frame as "illustrative allocation" for learning.
4) weightPercent should reflect sensible diversification (no single name above ~20% unless justified).
5) suggestedNumberOfStocks must match holdings.length.

Data freshness:
${digest}`;

  const userBlock = `USER GOAL
- Target monthly income: Rs ${monthly.toLocaleString('en-PK')}
- Assumed portfolio dividend yield: ${yieldPct}%
- Required portfolio value (user math): Rs ${Math.round(requiredPortfolio).toLocaleString('en-PK')}
- Shariah-only filter requested: ${shariahOnly ? 'yes' : 'no'}

DIVIDEND YIELD LIST (indicated yields from DividendFlow files — pick from here):
${yieldLines}

MARKET / NEWS SCRAPE:
---
${marketBlock}
---

Return JSON only.`;

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userBlock },
        ],
        max_tokens: 1200,
        temperature: 0.35,
        response_format: { type: 'json_object' },
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 45000,
      }
    );
    const raw = (response.data.choices[0]?.message?.content || '').trim();
    const parsed = parseGroqJsonBlock(raw);
    if (!parsed || !Array.isArray(parsed.holdings)) {
      return { ok: false, error: 'AI returned an unexpected format. Try again.' };
    }

    const holdings = parsed.holdings
      .map((h) => ({
        symbol: String(h.symbol || '').toUpperCase().trim(),
        weightPercent: Math.round((parseFloat(h.weightPercent) || 0) * 100) / 100,
        why: String(h.why || '').slice(0, 500),
        newsNote: String(h.newsNote || '').slice(0, 300),
      }))
      .filter((h) => h.symbol && h.weightPercent > 0);

    const totalWt = holdings.reduce((s, h) => s + h.weightPercent, 0);
    const normalized = holdings.map((h) => {
      const pct = totalWt > 0 ? (h.weightPercent / totalWt) * 100 : h.weightPercent;
      const allocationRs = Math.round((requiredPortfolio * pct) / 100);
      return {
        ...h,
        weightPercent: Math.round(pct * 100) / 100,
        allocationRs,
      };
    });

    return {
      ok: true,
      suggestedNumberOfStocks: parsed.suggestedNumberOfStocks || normalized.length,
      overview: String(parsed.overview || ''),
      todayMarketRead: String(parsed.todayMarketRead || ''),
      holdings: normalized,
      cautions: Array.isArray(parsed.cautions) ? parsed.cautions.map((c) => String(c).slice(0, 300)) : [],
      model: GROQ_MODEL,
    };
  } catch (err) {
    console.error('Groq salary portfolio advice error:', err.response?.status, err.response?.data || err.message);
    return { ok: false, error: groqHttpErrorMessage(err) };
  }
}

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

// POST /api/salary-simulator/ai-recommendations — Groq allocation ideas from news + dividend data
app.post('/api/salary-simulator/ai-recommendations', async (req, res) => {
  try {
    const rawIp = req.headers['x-forwarded-for'];
    const ip = typeof rawIp === 'string' ? rawIp.split(',')[0].trim() : rawIp?.[0] || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const prev = salaryAiRateByIp.get(ip) || 0;
    if (now - prev < SALARY_AI_MIN_INTERVAL_MS) {
      return res.status(429).json({
        ok: false,
        error: 'Please wait about 12 seconds before requesting another AI allocation.',
      });
    }
    salaryAiRateByIp.set(ip, now);

    const monthly = parseFloat(req.body?.targetMonthlyIncome) || 0;
    const yieldPct = parseFloat(req.body?.expectedDividendYield) || 0;
    let requiredPortfolio = parseFloat(req.body?.requiredPortfolioValue) || 0;
    const shariahOnly = Boolean(req.body?.shariahOnly);

    if (monthly <= 0 || yieldPct <= 0) {
      return res.status(400).json({ ok: false, error: 'Run the calculator first with valid income and yield.' });
    }
    if (requiredPortfolio <= 0) {
      requiredPortfolio = (monthly * 12) / (yieldPct / 100);
    }

    const advice = await groqSalaryPortfolioAdvice({
      monthly,
      yieldPct,
      requiredPortfolio,
      shariahOnly,
    });

    if (!advice.ok) {
      return res.status(advice.error?.includes('429') ? 429 : 503).json(advice);
    }

    res.json({
      ...advice,
      requiredPortfolioValue: Math.round(requiredPortfolio * 100) / 100,
      disclaimer:
        'Illustrative AI allocation from DividendFlow’s saved dividend calendar and news files — not live prices, not Shariah fatwa, and not investment advice. Verify every symbol, payout, and compliance rule with your broker and a qualified professional before investing.',
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Server error' });
  }
});

// GET /api/reporting-cycles - PSX reporting cycle data
app.get('/api/reporting-cycles', async (req, res) => {
  try {
    const data = await readMarketCSV('financials/psx_quarter_cycles.csv');
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
  if (!fs.existsSync(dailyPath) && !dataStore.isSupabaseConfigured()) return [];
  const rows = await readMarketCSV('prices/daily_prices.csv');
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
  if (fs.existsSync(path.join(newsPath, 'daily_news.csv')) || dataStore.isSupabaseConfigured()) {
    news = await readMarketCSV('news/daily_news.csv');
  }
  if (fs.existsSync(path.join(newsPath, 'ai_commentary.csv')) || dataStore.isSupabaseConfigured()) {
    commentary = await readMarketCSV('news/ai_commentary.csv');
  }
  priceChanges = await computePriceChangesFromDailyPrices();
  if (priceChanges.length === 0) {
    priceChanges = await readMarketCSV('prices/price_changes.csv');
  }
  const hasMeaningfulChanges = priceChanges.some(p => {
    const pct = parseFloat(p.ChangePct || p.changePct || p.Change_pct) || 0;
    return pct !== 0;
  });
  if (!hasMeaningfulChanges) {
    const fullPath = path.join(pricesPath, 'psx_full_dataset.csv');
    if (fs.existsSync(fullPath) || dataStore.isSupabaseConfigured()) {
      const fullRows = await readMarketCSV('prices/psx_full_dataset.csv');
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
  if (fs.existsSync(path.join(newsPath, 'price_commentary.csv')) || dataStore.isSupabaseConfigured()) {
    priceCommentary = await readMarketCSV('news/price_commentary.csv');
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
const contactRateByIp = new Map();
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
        max_tokens: 380,
        temperature: 0.25,
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

// GET /api/daily-news - Exchange-scoped news + prices + AI commentary (?exchange=PSX default)
app.get('/api/daily-news', async (req, res) => {
  try {
    const code = exchangeService.normalizeExchangeCode(req.query.exchange);
    const payload = await exchangeNews.getDailyNewsForExchange(code);
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
    const exchange = 'PSX';
    const symbol = req.body?.symbol || null;
    const holdings = Array.isArray(req.body?.holdings) ? req.body.holdings.slice(0, 25) : [];
    const chatHistory = Array.isArray(req.body?.history)
      ? req.body.history.slice(-8).map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          text: String(m.text || '').slice(0, 500),
        }))
      : [];
    if (!message) {
      return res.status(400).json({ ok: false, reply: 'Type a question first.' });
    }

    const newsPayload = await exchangeNews.getDailyNewsForExchange(exchange);
    const dataBlock = buildMarketChatContextText(newsPayload);
    const digest = buildSiteDataDigest();

    const ctx = await aiPipeline.prepareMarketChatContext({
      message,
      exchange,
      symbol,
      holdings,
      chatHistory,
      legacyDigest: digest,
      legacyDataBlock: dataBlock,
    });

    const out = await groqMarketChat(ctx.systemPrompt, ctx.userBlock);
    if (out.ok && out.reply) {
      aiPipeline.persistChatInsight(ctx.exchange, ctx.focusSymbol, out.reply, ctx.confidenceHint).catch(() => {});
    }
    res.json({
      ok: out.ok,
      reply: out.reply,
      disclaimer: INVESTMENT_DISCLAIMER,
      exchange: ctx.exchange,
      intent: ctx.intent,
      confidence: ctx.confidenceHint,
      confidenceHint: ctx.confidenceHint,
      sources: {
        database: true,
        scrapes: true,
        sentiment: Boolean(ctx.retrieval?.tools?.sentiment?.aggregate),
      },
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

// GET /api/market-closing-prices - PSX closing board (Supabase + CSV fallback)
app.get('/api/market-closing-prices', async (req, res) => {
  try {
    const globalDataStore = require('./services/globalDataStore');
    const payload = await globalDataStore.getClosingPrices('PSX');
    const rows = (payload.rows || []).filter((x) => x.symbol && x.close > 0);
    const gainers = rows
      .filter((r) => typeof r.changePct === 'number' && r.changePct > 0)
      .sort((a, b) => b.changePct - a.changePct);
    const losers = rows
      .filter((r) => typeof r.changePct === 'number' && r.changePct < 0)
      .sort((a, b) => a.changePct - b.changePct);
    const topGainer = gainers[0] || null;
    const topLoser = losers[0] || null;
    res.json({
      rows,
      date: payload.date,
      source: payload.source,
      meta: payload.meta,
      summary: {
        totalCompanies: rows.length,
        topGainer: topGainer ? { symbol: topGainer.symbol, changePct: topGainer.changePct } : null,
        topLoser: topLoser ? { symbol: topLoser.symbol, changePct: topLoser.changePct } : null,
        date: payload.date,
      },
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
- Explain metrics (dividend yield, price change, calendar entries) in plain language.
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

// GET /api/data-status - Last updated timestamp for PSX data (+ Supabase sync info)
app.get('/api/data-status', async (req, res) => {
  try {
    const scrapeFreshness = require('./services/scrapeFreshness');
    const freshness = await scrapeFreshness.getScrapeFreshnessReport();
    const priceSource = freshness.sources?.psx_prices;
    const lastDataDate = priceSource?.maxDataDate;
    const date = lastDataDate ? new Date(`${lastDataDate}T12:00:00Z`) : new Date();
    const supabaseMeta = await dataStore.getDataStatusExtra();
    res.json({
      lastUpdated: date.toISOString(),
      formatted: date.toLocaleString('en-PK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      latestTradingDate: lastDataDate,
      todayPkt: freshness.todayPkt,
      scrapeVerified: freshness.verified,
      scrapeStatus: freshness.overallStatus,
      scrapeSources: freshness.sources,
      storage: supabaseMeta.storage,
      supabaseConfigured: supabaseMeta.supabaseConfigured,
      lastSync: supabaseMeta.lastSync || freshness.supabase?.lastSync || null,
      rowCounts: supabaseMeta.rowCounts || null,
      marketCloseNotice: supabaseMeta.marketCloseNotice || MARKET_CLOSE_NOTICE,
      exchanges: exchangeService.listExchanges().map((e) => ({
        code: e.code,
        currency: e.currency,
        name: e.name,
      })),
    });
  } catch (err) {
    res.json({ lastUpdated: new Date().toISOString(), formatted: new Date().toLocaleString(), error: err.message });
  }
});

// GET /api/scrape-freshness — detailed verification of scrape file dates vs expected trading day
app.get('/api/scrape-freshness', async (req, res) => {
  try {
    const scrapeFreshness = require('./services/scrapeFreshness');
    const report = await scrapeFreshness.getScrapeFreshnessReport();
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.post('/api/contact', async (req, res) => {
  try {
    if (req.body?.website) {
      return res.json({ ok: true });
    }

    const rawIp = req.headers['x-forwarded-for'];
    const ip =
      typeof rawIp === 'string' ? rawIp.split(',')[0].trim() : rawIp?.[0] || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const prev = contactRateByIp.get(ip) || 0;
    if (now - prev < 60000) {
      return res.status(429).json({ ok: false, error: 'Please wait a minute before sending another message.' });
    }

    const name = String(req.body?.name || '').trim().slice(0, 120);
    const email = String(req.body?.email || '').trim().slice(0, 200);
    const subject = String(req.body?.subject || '').trim().slice(0, 200);
    const message = String(req.body?.message || '').trim().slice(0, 4000);

    if (!name || !email || !message) {
      return res.status(400).json({ ok: false, error: 'Name, email, and message are required.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
    }

    if (!contactMail.isContactConfigured()) {
      return res.status(503).json({
        ok: false,
        error: 'Contact delivery is not configured on the server yet. Please try again later.',
      });
    }

    await contactMail.sendContactMessage({ name, email, subject, message });
    contactRateByIp.set(ip, now);
    res.json({ ok: true, from: 'contact@dividendflow.pk' });
  } catch (err) {
    console.error('[contact]', err.message);
    res.status(500).json({ ok: false, error: 'Failed to send message. Please try again later.' });
  }
});

app.get('/api/health', async (req, res) => {
  const supabase = await dataStore.checkSupabaseHealth();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    storage: dataStore.isSupabaseConfigured() ? (supabase.ok ? 'supabase' : 'csv_fallback') : 'csv',
    supabase: supabase,
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`DividendFlow PK Backend running on http://localhost:${PORT}`);
  });
}

module.exports = app;
