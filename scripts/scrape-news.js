#!/usr/bin/env node
/**
 * Daily News Scraper for PSX Companies
 * Fetches news from Dawn RSS and optionally GNews API, filters by dividend companies,
 * then sends to Groq for AI commentary on adverse events.
 * Schedule: Daily (e.g. 2:00 UTC = 7am PKT)
 */
import axios from 'axios';
import Parser from 'rss-parser';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');

const RSS_FEEDS = [
  'https://www.dawn.com/feeds/business',
];

const USER_AGENT = 'DividendFlowPK/1.0 (PSX Dividend Intelligence; +https://github.com/AmmarJamshed/DividendFlowPK)';

function loadCompanies() {
  const path = join(DATA, 'dividends', 'psx_dividend_calendar.csv');
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, 'utf-8').split('\n').filter(Boolean);
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.replace(/^"|"$/g, '').trim());
    const row = {};
    headers.forEach((h, i) => row[h] = vals[i]);
    return row;
  });
  return [...new Set(rows.map(r => r.Company || r.company).filter(Boolean))];
}

function stripHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

async function fetchFromRss() {
  const parser = new Parser({ timeout: 30000, headers: { 'User-Agent': USER_AGENT } });
  const items = [];
  for (const url of RSS_FEEDS) {
    try {
      const feed = await parser.parseURL(url);
      (feed.items || []).forEach(item => {
        items.push({
          title: (item.title || '').trim(),
          description: stripHtml(item.content || item.contentSnippet || item.description || ''),
          link: item.link || '',
          pubDate: item.pubDate || new Date().toISOString(),
          source: feed.title || 'Dawn',
        });
      });
    } catch (err) {
      console.error('[News] RSS error', url, err.message);
    }
  }
  return items;
}

async function fetchFromGNews(companies) {
  const key = process.env.GNEWS_API_KEY;
  if (!key) return [];
  const items = [];
  const batchSize = 8;
  for (let i = 0; i < companies.length; i += batchSize) {
    const batch = companies.slice(i, i + batchSize);
    const query = batch.map(c => `"${c}"`).join(' OR ') + ' Pakistan stock';
    try {
      const { data } = await axios.get('https://gnews.io/api/v4/search', {
        params: { q: query, lang: 'en', max: 10, apikey: key },
        timeout: 15000,
      });
      (data.articles || []).forEach(a => {
        items.push({
          title: (a.title || '').trim(),
          description: stripHtml(a.description || ''),
          link: a.url || '',
          pubDate: a.publishedAt || new Date().toISOString(),
          source: a.source?.name || 'GNews',
        });
      });
    } catch (err) {
      console.error('[News] GNews error', err.message);
    }
  }
  return items;
}

function matchCompany(company, item) {
  const text = `${item.title} ${item.description}`.toLowerCase();
  const c = String(company).toLowerCase();
  const wordBoundary = new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  if (wordBoundary.test(text)) return true;
  const fullNames = {
    HBL: 'habib bank', MCB: 'muslim commercial bank', UBL: 'united bank',
    OGDC: 'oil and gas development', PPL: 'pakistan petroleum', PSO: 'pakistan state oil',
    FFC: 'fauji fertilizer', EFERT: 'engro fertilizer', NESTLE: 'nestle',
    ENGRO: 'engro', HUBC: 'hub power', KAPCO: 'kot addu power',
    POL: 'pakistan oil', ISL: 'international steel', KEL: 'karachi electric',
  };
  const full = fullNames[company];
  return full && text.includes(full);
}

function filterByCompanies(items, companies) {
  const results = [];
  for (const item of items) {
    for (const company of companies) {
      if (matchCompany(company, item)) {
        results.push({ ...item, Company: company });
        break;
      }
    }
  }
  return results;
}

async function getGroqCommentary(company, headlines) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === 'your_api_key_here') return null;
  const text = headlines.slice(0, 8).join('\n- ');
  const prompt = `You are a financial analyst for the Pakistan Stock Exchange. Comment briefly on these news headlines about ${company} (PSX). Focus on adverse events, regulatory issues, or governance risks that could impact dividend investors. Be concise (2-4 sentences). Do NOT give buy/sell advice.

Headlines:
- ${text}

Reply with your analysis only.`;

  try {
    const { data } = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.3,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );
    return (data.choices?.[0]?.message?.content || '').trim();
  } catch (err) {
    console.error('[News] Groq error for', company, err.message);
    return null;
  }
}

export async function getGroqPriceCommentary(company, direction, changePct, headlines) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === 'your_api_key_here') return null;
  const text = headlines.length > 0 ? headlines.slice(0, 6).join('\n- ') : 'No specific news found.';
  const prompt = `You are a financial analyst for the Pakistan Stock Exchange. ${company} stock ${direction} ${Math.abs(changePct).toFixed(1)}% today.

Relevant news:
- ${text}

In 2-3 sentences, explain why this stock likely ${direction === 'gained' ? 'gained' : 'declined'} based on the news. Be factual. Do NOT give buy/sell advice.`;

  try {
    const { data } = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150,
        temperature: 0.3,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );
    return (data.choices?.[0]?.message?.content || '').trim();
  } catch (err) {
    console.error('[News] Groq price commentary error for', company, err.message);
    return null;
  }
}

function csvEscape(val) {
  const s = String(val ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function scrapePsxNews() {
  const companies = loadCompanies();
  if (companies.length === 0) {
    console.log('[News] No companies found in dividend CSV');
    return { news: [], commentary: [] };
  }

  let items = await fetchFromRss();
  const gnews = await fetchFromGNews(companies);
  items = [...items, ...gnews];

  const matched = filterByCompanies(items, companies);
  const byCompany = new Map();
  for (const m of matched) {
    const c = m.Company;
    if (!byCompany.has(c)) byCompany.set(c, []);
    byCompany.get(c).push(m);
  }

  const news = [];
  const commentary = [];

  for (const [company, companyNews] of byCompany) {
    const headlines = companyNews.map(n => n.title).filter(Boolean);
    for (const n of companyNews) {
      news.push({
        Company: company,
        Headline: n.title,
        Date: n.pubDate,
        Source: n.source,
        Url: n.link,
      });
    }
    const aiComment = await getGroqCommentary(company, headlines);
    if (aiComment) {
      commentary.push({ Company: company, Commentary: aiComment, Date: new Date().toISOString().slice(0, 10) });
    }
  }

  return { news, commentary };
}

function toNewsCsv(rows) {
  const headers = ['Company', 'Headline', 'Date', 'Source', 'Url'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map(h => csvEscape(r[h])).join(','));
  }
  return lines.join('\n');
}

function toCommentaryCsv(rows) {
  const headers = ['Company', 'Commentary', 'Date'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map(h => csvEscape(r[h])).join(','));
  }
  return lines.join('\n');
}

async function main() {
  console.log('[News] Starting daily news scrape...');
  const { news, commentary } = await scrapePsxNews();
  console.log('[News] Matched', news.length, 'articles for', [...new Set(news.map(n => n.Company))].length, 'companies');
  console.log('[News] AI commentary for', commentary.length, 'companies');

  mkdirSync(join(DATA, 'news'), { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  writeFileSync(join(DATA, 'news', 'daily_news.csv'), toNewsCsv(news));
  writeFileSync(join(DATA, 'news', 'ai_commentary.csv'), toCommentaryCsv(commentary));
  console.log('[News] Saved to data/news/');
}

main().catch(err => {
  console.error('[News] Error:', err);
  process.exit(1);
});
