#!/usr/bin/env node
/**
 * ETL: load PSX CSV files into Supabase (dividendflow-pk project).
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in backend/.env
 *
 * Usage: node scripts/etl-csv-to-supabase.js
 */
const fs = require('fs');
const path = require('path');
const backendDir = path.join(__dirname, '../backend');
require(require.resolve('dotenv', { paths: [backendDir] })).config({
  path: path.join(backendDir, '.env'),
});
const csv = require(require.resolve('csv-parser', { paths: [backendDir] }));
const { createClient } = require(require.resolve('@supabase/supabase-js', { paths: [backendDir] }));

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const EXCHANGE_CODE = 'PSX';
const BATCH = 200;

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env');
  console.error('Project URL: https://dbkytlsejpxmclpznudk.supabase.co');
  console.error('Service role: Supabase Dashboard → Project Settings → API → service_role');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function readCsv(filePath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) return resolve([]);
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (d) => rows.push(d))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

function parseNum(val) {
  if (val == null || val === '') return null;
  const v = String(val).replace(/,/g, '').replace('%', '').trim();
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function parseIntSafe(val) {
  const n = parseInt(val, 10);
  return Number.isFinite(n) ? n : null;
}

function parseDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  const iso = s.slice(0, 10);
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return iso;
}

async function logSync(sourceFile, rowsProcessed, status, message) {
  await supabase.from('data_sync_log').insert({
    source_file: sourceFile,
    exchange_code: EXCHANGE_CODE,
    rows_processed: rowsProcessed,
    status,
    message: message || null,
  });
}

async function getExchangeId() {
  const { data, error } = await supabase
    .from('exchanges')
    .select('id')
    .eq('code', EXCHANGE_CODE)
    .single();
  if (error) throw error;
  return data.id;
}

async function loadShariahSet() {
  const fp = path.join(DATA, 'reference', 'psx_shariah_compliant.json');
  if (!fs.existsSync(fp)) return new Set();
  const j = JSON.parse(fs.readFileSync(fp, 'utf-8'));
  return new Set((j.symbols || []).map((s) => String(s).toUpperCase()));
}

async function upsertSecurities(exchangeId, shariahSet) {
  const calendar = await readCsv(path.join(DATA, 'dividends', 'psx_dividend_calendar.csv'));
  const payouts = await readCsv(path.join(DATA, 'dividends', 'psx_payouts.csv'));
  const full = await readCsv(path.join(DATA, 'prices', 'psx_full_dataset.csv'));

  const bySymbol = new Map();

  for (const r of calendar) {
    const sym = (r.Company || r.company || '').trim().toUpperCase();
    if (!sym) continue;
    bySymbol.set(sym, {
      exchange_id: exchangeId,
      symbol: sym,
      name: r.CompanyName || r.companyName || null,
      sector: (r.Sector || r.sector || '').trim() || null,
      shariah_compliant: shariahSet.has(sym),
      active: true,
      updated_at: new Date().toISOString(),
    });
  }

  for (const r of payouts) {
    const sym = (r.Company || r.company || '').trim().toUpperCase();
    if (!sym) continue;
    const existing = bySymbol.get(sym) || {
      exchange_id: exchangeId,
      symbol: sym,
      shariah_compliant: shariahSet.has(sym),
      active: true,
    };
    existing.name = (r.CompanyName || r.companyName || existing.name || '').trim() || null;
    existing.sector = (r.Sector || r.sector || existing.sector || '').trim() || null;
    existing.updated_at = new Date().toISOString();
    bySymbol.set(sym, existing);
  }

  for (const r of full) {
    const sym = (r.symbol || r.Symbol || '').trim().toUpperCase();
    if (!sym || bySymbol.has(sym)) continue;
    bySymbol.set(sym, {
      exchange_id: exchangeId,
      symbol: sym,
      shariah_compliant: shariahSet.has(sym),
      active: true,
      updated_at: new Date().toISOString(),
    });
  }

  const payload = [...bySymbol.values()];
  let upserted = 0;
  for (let i = 0; i < payload.length; i += BATCH) {
    const chunk = payload.slice(i, i + BATCH);
    const { error } = await supabase.from('securities').upsert(chunk, {
      onConflict: 'exchange_id,symbol',
    });
    if (error) throw error;
    upserted += chunk.length;
  }
  await logSync('securities', upserted, 'success');
  console.log(`Securities upserted: ${upserted}`);
  return upserted;
}

async function buildSecurityIdMap(exchangeId) {
  const { data, error } = await supabase
    .from('securities')
    .select('id, symbol')
    .eq('exchange_id', exchangeId);
  if (error) throw error;
  const map = new Map();
  for (const r of data || []) map.set(r.symbol.toUpperCase(), r.id);
  return map;
}

async function syncDividendCalendar(secMap) {
  const rows = await readCsv(path.join(DATA, 'dividends', 'psx_dividend_calendar.csv'));
  const payload = [];
  for (const r of rows) {
    const sym = (r.Company || r.company || '').trim().toUpperCase();
    const sid = secMap.get(sym);
    if (!sid) continue;
    payload.push({
      security_id: sid,
      dividend_per_share: parseNum(r.Dividend_per_share || r.dividend_per_share),
      payment_month: parseIntSafe(r.Payment_month || r.payment_month),
      dividend_yield: parseNum(r.Dividend_yield || r.dividend_yield),
      price: parseNum(r.Price || r.price),
      year: parseIntSafe(r.Year || r.year) || new Date().getFullYear(),
      source: 'calendar_csv',
      scraped_at: new Date().toISOString(),
    });
  }
  let n = 0;
  for (let i = 0; i < payload.length; i += BATCH) {
    const chunk = payload.slice(i, i + BATCH);
    const { error } = await supabase.from('dividend_calendar').upsert(chunk, {
      onConflict: 'security_id,year,payment_month',
    });
    if (error) throw error;
    n += chunk.length;
  }
  await logSync('dividends/psx_dividend_calendar.csv', n, 'success');
  console.log(`Dividend calendar rows: ${n}`);
}

async function syncPayouts(secMap) {
  const rows = await readCsv(path.join(DATA, 'dividends', 'psx_payouts.csv'));
  await supabase.from('dividend_payouts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const payload = [];
  for (const r of rows) {
    const sym = (r.Company || r.company || '').trim().toUpperCase();
    const sid = secMap.get(sym);
    if (!sid) continue;
    payload.push({
      security_id: sid,
      dividend_announcement: r.Dividend_announcement || r.dividend_announcement || null,
      announcement_date: parseDate(r.Announcement_date || r.announcement_date),
      book_closure: parseDate(r.Book_closure || r.book_closure),
      book_closure_end: parseDate(r.BookClosureEnd || r.bookClosureEnd),
      payment_month: parseIntSafe(r.Payment_month || r.payment_month),
      year: parseIntSafe(r.Year || r.year),
      source: 'psx_payouts',
      scraped_at: new Date().toISOString(),
    });
  }
  let n = 0;
  for (let i = 0; i < payload.length; i += BATCH) {
    const chunk = payload.slice(i, i + BATCH);
    const { error } = await supabase.from('dividend_payouts').insert(chunk);
    if (error) throw error;
    n += chunk.length;
  }
  await logSync('dividends/psx_payouts.csv', n, 'success');
  console.log(`Dividend payouts rows: ${n}`);
}

async function syncQuarterCycles(secMap) {
  const rows = await readCsv(path.join(DATA, 'financials', 'psx_quarter_cycles.csv'));
  const payload = [];
  for (const r of rows) {
    const sym = (r.Company || r.company || '').trim().toUpperCase();
    const sid = secMap.get(sym);
    if (!sid) continue;
    payload.push({
      security_id: sid,
      fiscal_year_end: r.Fiscal_Year_End || r.fiscal_year_end || null,
      quarter_end_months: r.Quarter_End_Months || r.quarter_end_months || null,
      dividend_announcement_period: r.Dividend_Announcement_Period || r.dividend_announcement_period || null,
      book_closure_month: r.Book_Closure_Month || r.book_closure_month || null,
      estimated_payment_month: r.Estimated_Payment_Month || r.estimated_payment_month || null,
      source: 'psx_cycles',
      scraped_at: new Date().toISOString(),
    });
  }
  let n = 0;
  for (let i = 0; i < payload.length; i += BATCH) {
    const chunk = payload.slice(i, i + BATCH);
    const { error } = await supabase.from('quarter_cycles').upsert(chunk, {
      onConflict: 'security_id',
    });
    if (error) throw error;
    n += chunk.length;
  }
  await logSync('financials/psx_quarter_cycles.csv', n, 'success');
  console.log(`Quarter cycles rows: ${n}`);
}

async function syncDailyPrices(secMap) {
  const rows = await readCsv(path.join(DATA, 'prices', 'psx_full_dataset.csv'));
  const payload = [];
  for (const r of rows) {
    const sym = (r.symbol || r.Symbol || '').trim().toUpperCase();
    const sid = secMap.get(sym);
    if (!sid) continue;
    const tradeDate = parseDate(r.date || r.Date);
    if (!tradeDate) continue;
    payload.push({
      security_id: sid,
      trade_date: tradeDate,
      open: parseNum(r.open || r.Open),
      high: parseNum(r.high || r.High),
      low: parseNum(r.low || r.Low),
      close: parseNum(r.close || r.Close),
      ldcp: parseNum(r.ldcp || r.LDCP),
      change_amount: parseNum(r.change || r.Change),
      change_pct: parseNum(r.change_pct || r.ChangePct),
      volume: parseInt(String(r.volume || r.Volume || '0').replace(/,/g, ''), 10) || null,
      currency: 'PKR',
      source: 'psx_full_dataset',
      scraped_at: new Date().toISOString(),
    });
  }
  let n = 0;
  for (let i = 0; i < payload.length; i += BATCH) {
    const chunk = payload.slice(i, i + BATCH);
    const { error } = await supabase.from('daily_prices').upsert(chunk, {
      onConflict: 'security_id,trade_date',
    });
    if (error) throw error;
    n += chunk.length;
  }
  await logSync('prices/psx_full_dataset.csv', n, 'success');
  console.log(`Daily prices rows: ${n}`);
}

async function syncPriceHistory(secMap) {
  const rows = await readCsv(path.join(DATA, 'prices', 'daily_prices.csv'));
  const payload = [];
  for (const r of rows) {
    const sym = (r.Company || r.company || '').trim().toUpperCase();
    const sid = secMap.get(sym);
    if (!sid) continue;
    const d = parseDate(r.Date || r.date);
    const price = parseNum(r.Price || r.price);
    if (!d || price == null) continue;
    payload.push({
      security_id: sid,
      price_date: d,
      close_price: price,
      source: 'daily_prices_csv',
      scraped_at: new Date().toISOString(),
    });
  }
  let n = 0;
  for (let i = 0; i < payload.length; i += BATCH) {
    const chunk = payload.slice(i, i + BATCH);
    const { error } = await supabase.from('price_history').upsert(chunk, {
      onConflict: 'security_id,price_date',
    });
    if (error) throw error;
    n += chunk.length;
  }
  await logSync('prices/daily_prices.csv', n, 'success');
  console.log(`Price history rows: ${n}`);
}

async function syncPriceChanges(secMap) {
  const fp = path.join(DATA, 'prices', 'price_changes.csv');
  const rows = await readCsv(fp);
  if (!rows.length) return;
  await supabase.from('price_changes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const payload = [];
  for (const r of rows) {
    const sym = (r.Company || r.company || '').trim().toUpperCase();
    const sid = secMap.get(sym);
    if (!sid) continue;
    payload.push({
      security_id: sid,
      price: parseNum(r.Price || r.price),
      previous_price: parseNum(r.PreviousPrice || r.previousPrice),
      change_amount: parseNum(r.Change || r.change),
      change_pct: parseNum(r.ChangePct || r.changePct),
      change_date: parseDate(r.Date || r.date),
      source: 'price_changes_csv',
      scraped_at: new Date().toISOString(),
    });
  }
  let n = 0;
  for (let i = 0; i < payload.length; i += BATCH) {
    const chunk = payload.slice(i, i + BATCH);
    const { error } = await supabase.from('price_changes').insert(chunk);
    if (error) throw error;
    n += chunk.length;
  }
  await logSync('prices/price_changes.csv', n, 'success');
  console.log(`Price changes rows: ${n}`);
}

async function syncNews(secMap) {
  const newsRows = await readCsv(path.join(DATA, 'news', 'daily_news.csv'));
  await supabase.from('news_articles').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const payload = newsRows.map((r) => {
    const sym = (r.Company || r.company || '').trim().toUpperCase();
    return {
      security_id: secMap.get(sym) || null,
      company_symbol: sym || null,
      headline: r.Headline || r.headline || '',
      published_date: parseDate(r.Date || r.date),
      source: r.Source || r.source || null,
      url: r.Url || r.url || null,
      scraped_at: new Date().toISOString(),
    };
  }).filter((r) => r.headline);
  if (payload.length) {
    const { error } = await supabase.from('news_articles').insert(payload);
    if (error) throw error;
  }
  await logSync('news/daily_news.csv', payload.length, 'success');
  console.log(`News articles: ${payload.length}`);

  const aiRows = await readCsv(path.join(DATA, 'news', 'ai_commentary.csv'));
  await supabase.from('news_ai_commentary').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const aiPayload = aiRows
    .filter((r) => (r.Commentary || r.commentary || '').trim())
    .map((r) => {
      const sym = (r.Company || r.company || '').trim().toUpperCase();
      return {
        security_id: secMap.get(sym) || null,
        company_symbol: sym,
        commentary: r.Commentary || r.commentary,
        commentary_date: parseDate(r.Date || r.date),
        model: 'groq',
        created_at: new Date().toISOString(),
      };
    });
  if (aiPayload.length) {
    const { error } = await supabase.from('news_ai_commentary').insert(aiPayload);
    if (error) throw error;
  }
  console.log(`AI commentary: ${aiPayload.length}`);

  const pcRows = await readCsv(path.join(DATA, 'news', 'price_commentary.csv'));
  await supabase.from('news_price_commentary').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const pcPayload = pcRows
    .filter((r) => (r.Commentary || r.commentary || '').trim())
    .map((r) => {
      const sym = (r.Company || r.company || '').trim().toUpperCase();
      return {
        security_id: secMap.get(sym) || null,
        company_symbol: sym,
        direction: r.Direction || r.direction || null,
        change_pct: parseNum(r.ChangePct || r.changePct),
        commentary: r.Commentary || r.commentary,
        commentary_date: parseDate(r.Date || r.date),
        model: 'groq',
        created_at: new Date().toISOString(),
      };
    });
  if (pcPayload.length) {
    const { error } = await supabase.from('news_price_commentary').insert(pcPayload);
    if (error) throw error;
  }
  console.log(`Price commentary: ${pcPayload.length}`);
}

async function main() {
  console.log('DividendFlow ETL → Supabase');
  console.log('URL:', url);

  const exchangeId = await getExchangeId();
  const shariahSet = await loadShariahSet();

  await upsertSecurities(exchangeId, shariahSet);
  const secMap = await buildSecurityIdMap(exchangeId);
  console.log(`Security map size: ${secMap.size}`);

  await syncDividendCalendar(secMap);
  await syncPayouts(secMap);
  await syncQuarterCycles(secMap);
  await syncDailyPrices(secMap);
  await syncPriceHistory(secMap);
  await syncPriceChanges(secMap);
  await syncNews(secMap);

  console.log('ETL complete.');
}

main().catch(async (err) => {
  console.error('ETL failed:', err.message || err);
  try {
    await logSync('etl', 0, 'error', err.message);
  } catch (_) {}
  process.exit(1);
});
