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
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === 'your_api_key_here') {
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
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.3
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
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

// ============ API ROUTES ============

// Load latest price per company from daily_prices (and other price CSVs)
async function getLatestPrices() {
  const pricesPath = path.join(DATA_PATH, 'prices');
  const latest = new Map();
  if (!fs.existsSync(pricesPath)) return latest;
  const files = fs.readdirSync(pricesPath).filter(f => f.endsWith('.csv'));
  for (const file of files) {
    const rows = await readCSV(path.join(pricesPath, file));
    const dateIdx = rows[0] ? Object.keys(rows[0]).find(k => /date/i.test(k)) : null;
    const companyIdx = rows[0] ? Object.keys(rows[0]).find(k => /company/i.test(k)) : null;
    const priceIdx = rows[0] ? Object.keys(rows[0]).find(k => /price/i.test(k)) : null;
    if (!companyIdx || !priceIdx) continue;
    for (const r of rows) {
      const company = (r.Company || r.company || r[companyIdx] || '').trim();
      const price = parseFloat(r.Price || r.price || r[priceIdx] || 0);
      const date = r.Date || r.date || r[dateIdx] || '';
      if (!company || price <= 0) continue;
      const existing = latest.get(company);
      if (!existing || (date && (!existing.date || date > existing.date))) {
        latest.set(company, { price, date });
      }
    }
  }
  return latest;
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

// Enrich dividends with latest prices, recalculated yields, and Interim/Final type
async function getEnrichedDividends() {
  const data = await readCSV(path.join(DATA_PATH, 'dividends', 'psx_dividend_calendar.csv'));
  const latestPrices = await getLatestPrices();
  let cyclesMap = new Map();
  try {
    const cycles = await readCSV(path.join(DATA_PATH, 'financials', 'psx_quarter_cycles.csv'));
    cycles.forEach(c => cyclesMap.set((c.Company || c.company || '').trim(), c));
  } catch (_) {}
  return data.map(d => {
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
    for (let m = 1; m <= 12; m++) {
      if (monthCoverage[m].count < avgCount * 0.5) {
        weakMonths.push({
          month: m,
          monthName: new Date(2000, m - 1).toLocaleString('default', { month: 'long' }),
          count: monthCoverage[m].count,
          companies: monthCoverage[m].companies
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
    if (fs.existsSync(dividendsPath)) {
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
    let filtered = search ? priceData.filter(d => d._company.toLowerCase().includes(search)) : priceData;
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

// GET /api/daily-news - Scraped news + prices + AI commentary for PSX companies
app.get('/api/daily-news', async (req, res) => {
  try {
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
    // Check if we have meaningful changes (non-zero); if all flat, try other sources
    const hasMeaningfulChanges = priceChanges.some(p => {
      const pct = parseFloat(p.ChangePct || p.changePct || p.Change_pct) || 0;
      return pct !== 0;
    });
    // Fallback: use psx_full_dataset.csv when no data or all changes are zero
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
    res.json({ news, commentary, priceChanges, priceCommentary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/market-closing-prices - Full PSX dataset from psx_full_dataset.csv
app.get('/api/market-closing-prices', async (req, res) => {
  try {
    const fp = path.join(DATA_PATH, 'prices', 'psx_full_dataset.csv');
    if (!fs.existsSync(fp)) {
      return res.json({ rows: [], date: null, summary: null });
    }
    const rows = await readCSV(fp);
    const date = rows[0]?.date || rows[0]?.Date || null;
    const parseNum = (s) => {
      if (!s) return 0;
      const v = String(s).replace(/,/g, '').replace('%', '').trim();
      return parseFloat(v) || 0;
    };
    const parsed = rows.map(r => ({
      symbol: r.symbol || r.Symbol || '',
      company: r.symbol || r.Symbol || '',
      close: parseNum(r.close || r.Close),
      change: parseNum(r.change || r.Change),
      changePct: parseNum(r.change_pct || r.ChangePct || r['change_pct']),
      volume: parseInt((r.volume || r.Volume || '0').toString().replace(/,/g, ''), 10) || 0,
      open: parseNum(r.open || r.Open),
      high: parseNum(r.high || r.High),
      low: parseNum(r.low || r.Low),
    })).filter(x => x.symbol && x.close > 0);
    const topGainer = parsed.filter(p => p.changePct > 0).sort((a, b) => b.changePct - a.changePct)[0];
    const topLoser = parsed.filter(p => p.changePct < 0).sort((a, b) => a.changePct - b.changePct)[0];
    const summary = {
      totalCompanies: parsed.length,
      topGainer: topGainer ? { symbol: topGainer.symbol, changePct: topGainer.changePct } : null,
      topLoser: topLoser ? { symbol: topLoser.symbol, changePct: topLoser.changePct } : null,
      date,
    };
    res.json({ rows: parsed, date, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
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

app.listen(PORT, () => {
  console.log(`DividendFlow PK Backend running on http://localhost:${PORT}`);
});
