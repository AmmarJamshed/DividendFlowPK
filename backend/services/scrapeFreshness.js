const fs = require('fs');
const path = require('path');
const { getSupabase, isSupabaseConfigured } = require('../db/supabaseClient');

const DATA_PATH = path.join(__dirname, '..', '..', 'data');

function parseCsvMaxDate(filePath, dateColumns) {
  if (!fs.existsSync(filePath)) return { maxDate: null, rowCount: 0, fileMtime: null };
  const stat = fs.statSync(filePath);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n').filter(Boolean);
  if (lines.length < 2) return { maxDate: null, rowCount: 0, fileMtime: stat.mtime.toISOString() };

  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const colIdx = dateColumns
    .map((c) => headers.findIndex((h) => h.toLowerCase() === c.toLowerCase()))
    .find((i) => i >= 0);

  let maxDate = '';
  let rowCount = 0;

  for (let i = 1; i < lines.length; i++) {
    rowCount += 1;
    let val = '';
    if (colIdx >= 0) {
      // RFC2822 dates in news CSV break naive split — grab Date field via regex when needed
      const dateMatch = lines[i].match(/,"(?:[^"]|"")*",("[^"]+"|[^,]+),/);
      if (headers[colIdx]?.toLowerCase() === 'date' && dateMatch) {
        val = dateMatch[1].replace(/^"|"$/g, '');
      } else {
        const cols = lines[i].split(',');
        val = (cols[colIdx] || '').replace(/^"|"$/g, '').trim();
      }
    }
    if (!val) {
      const parsed = Date.parse(lines[i].match(/\d{4}-\d{2}-\d{2}/)?.[0] || lines[i]);
      if (!Number.isNaN(parsed)) val = new Date(parsed).toISOString().slice(0, 10);
      else {
        const rfc = lines[i].match(/\w{3},\s+\d{2}\s+\w{3}\s+\d{4}/);
        if (rfc) {
          const p = Date.parse(rfc[0]);
          if (!Number.isNaN(p)) val = new Date(p).toISOString().slice(0, 10);
        }
      }
    }
    if (!val) continue;
    const iso = val.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      if (iso > maxDate) maxDate = iso;
    } else {
      const parsed = Date.parse(val);
      if (!Number.isNaN(parsed)) {
        const d = new Date(parsed).toISOString().slice(0, 10);
        if (d > maxDate) maxDate = d;
      }
    }
  }
  return { maxDate: maxDate || null, rowCount, fileMtime: stat.mtime.toISOString() };
}

function lastTradingDayIso(now = new Date()) {
  const pkt = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Karachi' }));
  const hour = pkt.getHours();
  let d = new Date(pkt);
  d.setHours(0, 0, 0, 0);

  const isWeekend = (date) => {
    const day = date.getDay();
    return day === 0 || day === 6;
  };

  const prevWeekday = (date) => {
    const x = new Date(date);
    do {
      x.setDate(x.getDate() - 1);
    } while (isWeekend(x));
    return x;
  };

  // Scrapes run ~17:00 PKT (12:00 UTC). Before that on a weekday, expect prior close.
  if (isWeekend(d)) {
    while (isWeekend(d)) d.setDate(d.getDate() - 1);
  } else if (hour < 17) {
    d = prevWeekday(d);
  }

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayPktIso(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
}

function assessFreshness(maxDate, now = new Date()) {
  const expected = lastTradingDayIso(now);
  const todayPkt = todayPktIso(now);
  if (!maxDate) return { status: 'missing', expectedLatest: expected, todayPkt };
  if (maxDate >= expected) return { status: 'current', expectedLatest: expected, todayPkt };
  if (maxDate >= todayPkt) return { status: 'current', expectedLatest: expected, todayPkt };
  const lagMs = new Date(expected).getTime() - new Date(maxDate).getTime();
  const lagDays = Math.round(lagMs / (24 * 3600 * 1000));
  return { status: lagDays <= 1 ? 'slightly_stale' : 'stale', lagDays, expectedLatest: expected, todayPkt };
}

async function supabaseFreshness() {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = getSupabase();
    const [syncRes, priceRes, newsRes, aiRes] = await Promise.all([
      supabase.from('data_sync_log').select('synced_at, source_file, status').order('synced_at', { ascending: false }).limit(5),
      supabase.from('daily_prices').select('trade_date').order('trade_date', { ascending: false }).limit(1),
      supabase.from('news_articles').select('published_date').order('published_date', { ascending: false }).limit(1),
      supabase.from('news_ai_commentary').select('commentary_date, created_at').order('created_at', { ascending: false }).limit(1),
    ]);
    return {
      lastSync: syncRes.data?.[0]?.synced_at || null,
      lastSyncFile: syncRes.data?.[0]?.source_file || null,
      maxPriceDate: priceRes.data?.[0]?.trade_date || null,
      maxNewsDate: newsRes.data?.[0]?.published_date || null,
      lastAiCommentary: aiRes.data?.[0]?.commentary_date || aiRes.data?.[0]?.created_at || null,
    };
  } catch (err) {
    return { error: err.message };
  }
}

async function getScrapeFreshnessReport() {
  const files = [
    { key: 'psx_prices', label: 'PSX closing prices', path: 'prices/psx_full_dataset.csv', dateCols: ['date', 'Date'] },
    { key: 'daily_prices', label: 'Daily price history', path: 'prices/daily_prices.csv', dateCols: ['Date', 'date'] },
    { key: 'price_changes', label: 'Price changes', path: 'prices/price_changes.csv', dateCols: ['Date', 'date'] },
    { key: 'daily_news', label: 'Daily news', path: 'news/daily_news.csv', dateCols: ['Date', 'date'] },
    { key: 'ai_commentary', label: 'AI news commentary', path: 'news/ai_commentary.csv', dateCols: ['Date', 'date'] },
    { key: 'price_commentary', label: 'AI price commentary', path: 'news/price_commentary.csv', dateCols: ['Date', 'date'] },
    { key: 'dividend_calendar', label: 'Dividend calendar', path: 'dividends/psx_dividend_calendar.csv', dateCols: ['Year', 'year'] },
  ];

  const now = new Date();
  const sources = {};
  let worstStatus = 'current';

  for (const f of files) {
    const fp = path.join(DATA_PATH, f.path);
    const parsed = parseCsvMaxDate(fp, f.dateCols);
    const freshness =
      f.key === 'dividend_calendar'
        ? { status: parsed.rowCount > 0 ? 'current' : 'missing', expectedLatest: null, todayPkt: todayPktIso(now) }
        : assessFreshness(parsed.maxDate, now);
    sources[f.key] = {
      label: f.label,
      path: f.path,
      maxDataDate: parsed.maxDate,
      rowCount: parsed.rowCount,
      fileModified: parsed.fileMtime,
      ...freshness,
    };
    if (parsed.rowCount === 0 && f.key.includes('commentary')) {
      sources[f.key].status = 'empty';
      sources[f.key].issue = 'File has header only — Groq commentary not generated';
    }
    const rank = { current: 0, slightly_stale: 1, stale: 2, missing: 3, empty: 3 };
    if (rank[sources[f.key].status] > rank[worstStatus]) worstStatus = sources[f.key].status;
  }

  const supabase = await supabaseFreshness();
  const verified = worstStatus === 'current' && !Object.values(sources).some((s) => s.status === 'empty');

  return {
    checkedAt: now.toISOString(),
    todayPkt: todayPktIso(now),
    expectedLatestTradingDay: lastTradingDayIso(now),
    overallStatus: verified ? 'verified' : worstStatus === 'current' ? 'partial' : worstStatus,
    verified,
    sources,
    supabase,
    note: 'PSX scrapes run weekdays ~17:00 PKT (12:00 UTC). Price dates reflect last market close, not calendar midnight.',
  };
}

module.exports = {
  getScrapeFreshnessReport,
  parseCsvMaxDate,
  lastTradingDayIso,
  todayPktIso,
};
