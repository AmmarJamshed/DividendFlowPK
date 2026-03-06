#!/usr/bin/env node
/**
 * PSX Dividend & Reporting Cycle Scraper
 * Fetches dividend data from psxterminal.com and other sources
 * Output: JSON for dividends and reporting cycles
 */
import axios from 'axios';
import * as cheerio from 'cheerio';

const PSX_TERMINAL_YIELDS = 'https://psxterminal.com/yields';
const USER_AGENT = 'DividendFlowPK/1.0 (PSX Dividend Intelligence; +https://github.com/AmmarJamshed/DividendFlowPK)';

// Sector mapping for known tickers
const SECTOR_MAP = {
  HBL: 'Commercial Banks', MCB: 'Commercial Banks', UBL: 'Commercial Banks',
  ABL: 'Commercial Banks', BAFL: 'Commercial Banks', BAHL: 'Commercial Banks',
  HMB: 'Commercial Banks', AABS: 'Commercial Banks',
  OGDC: 'Oil & Gas Exploration', PPL: 'Oil & Gas Exploration', MARI: 'Oil & Gas Exploration',
  PSO: 'Oil & Gas Marketing', POL: 'Oil & Gas Marketing', APL: 'Oil & Gas Marketing',
  FFC: 'Fertilizer', EFERT: 'Fertilizer', FATIMA: 'Fertilizer',
  LUCK: 'Cement', DGKC: 'Cement', MLCF: 'Cement', CHCC: 'Cement', ABOT: 'Cement', ACPL: 'Cement',
  HUBC: 'Power Generation', KAPCO: 'Power Generation', NCPL: 'Power Generation',
  NPL: 'Power Generation', LPL: 'Power Generation', KEL: 'Power Distribution',
  NESTLE: 'Food & Personal Care', UNITY: 'Food & Personal Care', COLG: 'Food & Personal Care',
  TRG: 'Technology', SYS: 'Technology',
  ENGRO: 'Investment Banks', INDM: 'Automobiles', ISL: 'Steel', TGL: 'Glass',
  NCL: 'Textiles', EPCL: 'Chemicals', PNSC: 'Transport',
  AGIC: 'Insurance', AGIL: 'Pharmaceuticals', ADAMS: 'Pharmaceuticals',
};

// Fiscal year end by sector (typical)
const FISCAL_END = { 'Commercial Banks': 'December', 'Fertilizer': 'June', 'Oil & Gas Exploration': 'June',
  'Cement': 'June', 'Power Generation': 'June', 'Food & Personal Care': 'December', 'Technology': 'June' };

function getSector(ticker) {
  return SECTOR_MAP[ticker] || 'Other';
}

function parsePaymentMonth(lastDivStr) {
  const m = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
  const match = lastDivStr?.match(/\((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\)/);
  return match ? m[match[1]] : 10;
}

export async function scrapePsxTerminal() {
  const dividends = [];
  try {
    const { data } = await axios.get(PSX_TERMINAL_YIELDS, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 15000,
    });
    const year = new Date().getFullYear();

    // Parse from HTML or pre-rendered text (psxterminal may be SPA - try regex fallback)
    const $ = cheerio.load(data);
    $('h3').each((_, el) => {
      const text = $(el).text().trim();
      const tickerMatch = text.match(/^([A-Z0-9]{2,12})$/);
      if (!tickerMatch) return;
      const ticker = tickerMatch[1];
      const card = $(el).closest('div').parent();
      const cardText = card.text();
      const priceMatch = cardText.match(/PKR\s+([\d,]+\.?\d*)/);
      const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : 0;
      const totalPaid = cardText.match(/Total Paid\s+([\d.]+)/)?.[1] || '0';
      const yieldMatch = cardText.match(/Acc\. Yield\s+([\d.]+)%/);
      const yieldPct = yieldMatch ? parseFloat(yieldMatch[1]) : 0;
      const lastDivMatch = cardText.match(/Last Div\s+\(([^)]+)\)\s+([\d.]+)/);
      const lastDiv = lastDivMatch ? parseFloat(lastDivMatch[2]) : parseFloat(totalPaid) || 0;
      const paymentMonth = lastDivMatch ? parsePaymentMonth(lastDivMatch[1]) : 10;

      if (yieldPct > 0 && paymentMonth >= 1 && paymentMonth <= 12) {
        dividends.push({
          Company: ticker,
          Sector: getSector(ticker),
          Dividend_per_share: lastDiv,
          Payment_month: paymentMonth,
          Dividend_yield: yieldPct,
          Price: price,
          Year: year,
        });
      }
    });

    // Regex fallback if cheerio finds nothing (SPA shell)
    if (dividends.length < 5 && /### [A-Z0-9]{2,12}/.test(data)) {
      const blocks = data.split(/### ([A-Z0-9]{2,12})/);
      for (let i = 1; i < blocks.length; i += 2) {
        const ticker = blocks[i];
        const block = blocks[i + 1] || '';
        const yMatch = block.match(/Acc\. Yield\s+([\d.]+)%/);
        const yieldPct = yMatch ? parseFloat(yMatch[1]) : 0;
        const lastMatch = block.match(/Last Div\s+\(([^)]+)\)\s+([\d.]+)/);
        const lastDiv = lastMatch ? parseFloat(lastMatch[2]) : 0;
        const payMonth = lastMatch ? parsePaymentMonth(lastMatch[1]) : 10;
        if (yieldPct > 0 && lastDiv > 0) {
          const priceMatch = block.match(/[\d,]+\.?\d*/);
          dividends.push({
            Company: ticker,
            Sector: getSector(ticker),
            Dividend_per_share: lastDiv,
            Payment_month: payMonth,
            Dividend_yield: yieldPct,
            Price: priceMatch ? parseFloat(priceMatch[0].replace(/,/g, '')) : 0,
            Year: year,
          });
        }
      }
    }
  } catch (err) {
    console.error('PsxTerminal scrape error:', err.message);
  }
  return dividends;
}

export function buildReportingCycles(dividends) {
  const seen = new Set();
  return dividends.map(d => {
    const key = d.Company;
    if (seen.has(key)) return null;
    seen.add(key);
    const sector = d.Sector;
    const fyEnd = FISCAL_END[sector] || 'June';
    const qMonths = fyEnd === 'December' ? 'Mar,Jun,Sep,Dec' : 'Sep,Dec,Mar,Jun';
    const annPeriod = fyEnd === 'December' ? 'Feb,May,Aug,Nov' : 'Nov,Feb,May,Aug';
    const payMonth = d.Payment_month;
    const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return {
      Company: d.Company,
      Sector: sector,
      Fiscal_Year_End: fyEnd,
      Quarter_End_Months: qMonths,
      Dividend_Announcement_Period: annPeriod,
      Book_Closure_Month: monthNames[payMonth] || 'September',
      Estimated_Payment_Month: monthNames[payMonth] || 'October',
    };
  }).filter(Boolean);
}

export function mergeWithFallback(scraped, fallbackPath) {
  const byCompany = new Map(scraped.map(d => [d.Company, d]));
  for (const d of fallbackPath) {
    if (!byCompany.has(d.Company)) byCompany.set(d.Company, d);
  }
  return Array.from(byCompany.values());
}
