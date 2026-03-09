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

// GET /api/dividends - Dividend calendar data
app.get('/api/dividends', async (req, res) => {
  try {
    const data = await readCSV(path.join(DATA_PATH, 'dividends', 'psx_dividend_calendar.csv'));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/month-coverage - Monthly dividend coverage for Weak Month Optimizer
app.get('/api/month-coverage', async (req, res) => {
  try {
    const dividends = await readCSV(path.join(DATA_PATH, 'dividends', 'psx_dividend_calendar.csv'));
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

// GET /api/forecast - Price forecast with technical indicators
app.get('/api/forecast', async (req, res) => {
  try {
    const { company } = req.query;
    const pricesPath = path.join(DATA_PATH, 'prices');
    let priceData = [];
    
    if (fs.existsSync(pricesPath)) {
      const files = fs.readdirSync(pricesPath).filter(f => f.endsWith('.csv'));
      for (const file of files) {
        const data = await readCSV(path.join(pricesPath, file));
        const filtered = company ? data.filter(d => 
          (d.Company || d.company || '').toLowerCase().includes(company.toLowerCase())
        ) : data;
        priceData = priceData.concat(filtered);
      }
    }

    if (priceData.length === 0) {
      return res.json({
        company: company || 'Sample',
        lowCase: 0, baseCase: 0, highCase: 0,
        rsi: 50, macd: 0, volatility: 0,
        message: 'Insufficient price data. Add CSV files to data/prices/'
      });
    }

    const prices = priceData
      .map(d => parseFloat(d.Price || d.price || d.Close || d.close || 0))
      .filter(p => p > 0)
      .slice(-50);

    const lastPrice = prices[prices.length - 1] || 100;
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
      lastPrice
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

// GET /api/daily-news - Scraped news + AI commentary for PSX companies
app.get('/api/daily-news', async (req, res) => {
  try {
    const newsPath = path.join(DATA_PATH, 'news');
    let news = [];
    let commentary = [];
    if (fs.existsSync(path.join(newsPath, 'daily_news.csv'))) {
      news = await readCSV(path.join(newsPath, 'daily_news.csv'));
    }
    if (fs.existsSync(path.join(newsPath, 'ai_commentary.csv'))) {
      commentary = await readCSV(path.join(newsPath, 'ai_commentary.csv'));
    }
    res.json({ news, commentary });
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
