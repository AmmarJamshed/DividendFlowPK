import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useExchange } from '../context/ExchangeContext';
import { stockPath } from '../config/exchanges';
import { isShariahCompliant, SHARIAH_LIST_META } from '../utils/psxShariah';
import PageHero from '../components/ui/PageHero';
import MetricCard from '../components/ui/MetricCard';
import Disclaimer from '../components/Disclaimer';

const PAGE_SIZE = 25;

function formatNum(n) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-PK', { maximumFractionDigits: 2 });
}

function formatStockLabel(row) {
  if (!row) return '—';
  const sym = row.symbol || '';
  const name = (row.company || '').trim();
  if (name && name !== sym && !/^\d+$/.test(name)) return name;
  return sym || '—';
}

function AICommentary({ summary, exchangeName, rowsBySymbol }) {
  if (!summary) return null;
  const { totalCompanies, topGainer, topLoser, date } = summary;
  const gainerRow = topGainer ? rowsBySymbol?.get(topGainer.symbol) : null;
  const loserRow = topLoser ? rowsBySymbol?.get(topLoser.symbol) : null;
  const gainerLabel = topGainer
    ? `${formatStockLabel(gainerRow || topGainer)} +${topGainer.changePct?.toFixed(1)}%`
    : null;
  const loserLabel = topLoser
    ? `${formatStockLabel(loserRow || topLoser)} ${topLoser.changePct?.toFixed(1)}%`
    : null;
  const sentiment = totalCompanies > 0
    ? topGainer?.changePct > 0 && (!topLoser || Math.abs(topGainer.changePct) >= Math.abs(topLoser.changePct))
      ? 'Moderately positive'
      : topLoser?.changePct < 0 && (!topGainer || Math.abs(topLoser.changePct) >= Math.abs(topGainer.changePct))
        ? 'Cautious'
        : 'Mixed'
    : 'No data';
  const sectorNote = topGainer?.changePct > 2 ? ' with strong activity in select sectors.' : '.';

  return (
    <div className="bg-white border border-neutral-200 p-4 sm:p-6 mb-6">
      <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500 mb-2">
        Session summary
      </h3>
      <p className="text-neutral-700 text-sm leading-relaxed">
        {date ? `As of ${date}: ` : ''}
        Latest {exchangeName} session closed {sentiment.toLowerCase()}{sectorNote}
        {' '}Total companies traded: <strong className="text-slate-700">{formatNum(totalCompanies)}</strong>.
        {topGainer && (
          <> Top performer: <strong className="text-emerald-600">{gainerLabel}</strong>.</>
        )}
        {topLoser && (
          <> Worst performer: <strong className="text-red-400">{loserLabel}</strong>.</>
        )}
        {' '}Overall market sentiment: <strong className="text-slate-700">{sentiment}</strong>.
      </p>
    </div>
  );
}

export default function MarketClosingPrices() {
  const { exchange, exchangeConfig } = useExchange();
  const [data, setData] = useState({ rows: [], date: null, summary: null });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [shariahOnly, setShariahOnly] = useState(false);
  const [sort, setSort] = useState({ key: 'changePct', dir: 'desc' });
  const [page, setPage] = useState(0);

  useEffect(() => {
    setLoading(true);
    setPage(0);
    api.getMarketClosingPrices(exchange)
      .then((res) => setData(res.data || { rows: [], date: null, summary: null, meta: null }))
      .catch(() => setData({ rows: [], date: null, summary: null }))
      .finally(() => setLoading(false));
  }, [exchange]);

  const shariahInDataset = useMemo(() => {
    let n = 0;
    for (const r of data.rows || []) {
      if (isShariahCompliant(r.symbol)) n += 1;
    }
    return n;
  }, [data.rows]);

  const rowsBySymbol = useMemo(() => {
    const map = new Map();
    for (const r of data.rows || []) {
      if (r.symbol) map.set(r.symbol, r);
    }
    return map;
  }, [data.rows]);

  const marketPulse = useMemo(() => {
    const rows = data.rows || [];
    let gainers = 0;
    let losers = 0;
    let flat = 0;
    for (const r of rows) {
      const pct = r.changePct;
      if (pct == null || Number.isNaN(pct) || pct === 0) flat += 1;
      else if (pct > 0) gainers += 1;
      else losers += 1;
    }
    const topG = data.summary?.topGainer;
    const topL = data.summary?.topLoser;
    return {
      total: rows.length,
      gainers,
      losers,
      flat,
      topGainerLabel: topG ? `${formatStockLabel(rowsBySymbol.get(topG.symbol) || topG)} +${topG.changePct?.toFixed(1)}%` : '—',
      topLoserLabel: topL ? `${formatStockLabel(rowsBySymbol.get(topL.symbol) || topL)} ${topL.changePct?.toFixed(1)}%` : '—',
    };
  }, [data.rows, data.summary, rowsBySymbol]);

  const filtered = useMemo(() => {
    let list = data.rows || [];
    if (shariahOnly) {
      list = list.filter((r) => isShariahCompliant(r.symbol));
    }
    const q = (search || '').trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) => (r.symbol || '').toLowerCase().includes(q) || (r.company || '').toLowerCase().includes(q)
      );
    }
    const k = sort.key;
    const d = sort.dir === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => {
      const va = a[k];
      const vb = b[k];
      if (k === 'weekChgPct') {
        const na = typeof va === 'number' && !Number.isNaN(va) ? va : null;
        const nb = typeof vb === 'number' && !Number.isNaN(vb) ? vb : null;
        if (na == null && nb == null) return 0;
        if (na == null) return 1;
        if (nb == null) return -1;
        return d * (na - nb);
      }
      if (typeof va === 'number' && typeof vb === 'number') return d * (va - vb);
      return d * String(va || '').localeCompare(String(vb || ''));
    });
    return list;
  }, [data.rows, search, sort, shariahOnly]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSort = (key) => {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
    setPage(0);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="animate-spin w-10 h-10 border-2 border-teal-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        variant="light"
        eyebrow="Market data"
        title={`${exchangeConfig.name} closing prices`}
        description={
          exchange === 'PSX'
            ? 'Search symbols, sort by session and weekly change, and filter the PSX Shariah disclosure list. Sourced from archived scrape files, updated weekdays after the close.'
            : `Latest ${exchangeConfig.code} closes (${exchangeConfig.currency}) from DividendFlow cloud database. Full universes are loaded by scheduled GitHub Actions ingest; if the table is empty you may see a small Yahoo Finance preview instead.`
        }
      >
        <Link to="/dividend-calendar" className="btn-primary">
          Dividend calendar
        </Link>
        <Link to="/" className="btn-ghost-dark">
          Overview
        </Link>
      </PageHero>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Symbols"
          value={marketPulse.total}
          hint={data.date ? `Session ${data.date}` : 'Latest file'}
        />
        <MetricCard
          label="Advanced"
          value={marketPulse.gainers}
          hint={marketPulse.topGainerLabel !== '—' ? marketPulse.topGainerLabel : '—'}
        />
        <MetricCard
          label="Declined"
          value={marketPulse.losers}
          hint={marketPulse.topLoserLabel !== '—' ? marketPulse.topLoserLabel : '—'}
        />
        <MetricCard
          label="Shariah list"
          value={exchange === 'PSX' ? shariahInDataset : '—'}
          hint={exchange === 'PSX' ? `Of ${marketPulse.total} in dataset` : 'PSX only'}
        />
      </div>

      <AICommentary summary={data.summary} exchangeName={exchangeConfig.name} rowsBySymbol={rowsBySymbol} />
      <div className="rounded-2xl bg-white/90 border border-slate-200 shadow-lg shadow-slate-300/20 overflow-hidden backdrop-blur-sm">
        <div className="p-4 border-b border-slate-200 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center">
            <input
              type="search"
              placeholder="Search by stock or symbol..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-400/50 focus:border-teal-300 w-full sm:w-64"
            />
            <span className="text-sm text-slate-500 self-center text-right sm:text-left">
              {filtered.length} stocks
              {data.meta?.totalSymbols != null && data.meta.totalSymbols !== filtered.length && (
                <> • universe {data.meta.totalSymbols}</>
              )}
              {data.meta?.withPrices != null && (
                <> • {data.meta.withPrices} with latest close</>
              )}
              {shariahOnly && ` (Shariah list)`}
              {data.date && ` • Close ${data.date}`}
              {data.source === 'yahoo_seeds' && ' • Preview (major names)'}
            </span>
          </div>
          {exchange === 'PSX' && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide mr-1">Filter</span>
            <button
              type="button"
              onClick={() => { setShariahOnly(false); setPage(0); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                !shariahOnly
                  ? 'bg-teal-600 text-white border-teal-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300'
              }`}
            >
              All PSX (in dataset)
            </button>
            <button
              type="button"
              onClick={() => { setShariahOnly(true); setPage(0); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                shariahOnly
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300'
              }`}
              title={`PSX Annexure A: ${SHARIAH_LIST_META.symbolCount} symbols (${SHARIAH_LIST_META.asOf})`}
            >
              Shariah compliant only
            </button>
            <span className="text-xs text-slate-500">
              {shariahInDataset} of {(data.rows || []).length} rows match PSX list
            </span>
          </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className="text-left px-4 py-3 font-medium cursor-pointer hover:text-teal-600 rounded-tl-2xl" onClick={() => toggleSort('symbol')}>Stock</th>
                <th className="text-right px-4 py-3 font-medium cursor-pointer hover:text-teal-600" onClick={() => toggleSort('close')}>Close</th>
                <th className="text-right px-4 py-3 font-medium cursor-pointer hover:text-teal-600" onClick={() => toggleSort('change')}>Change</th>
                <th className="text-right px-4 py-3 font-medium cursor-pointer hover:text-teal-600" onClick={() => toggleSort('changePct')}>Daily %</th>
                <th
                  className="text-right px-4 py-3 font-medium cursor-pointer hover:text-teal-600"
                  onClick={() => toggleSort('weekChgPct')}
                  title="Approx. change vs price ~7 calendar days ago (daily_prices.csv)."
                >
                  Week %
                </th>
                <th className="text-right px-4 py-3 font-medium cursor-pointer hover:text-teal-600 rounded-tr-2xl" onClick={() => toggleSort('volume')}>Shares Traded</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    {shariahOnly
                      ? 'No Shariah-listed symbols in today’s closing dataset (or none match your search).'
                      : 'No data available'}
                  </td>
                </tr>
              ) : (
                pageRows.map((r, i) => {
                  const shariah = isShariahCompliant(r.symbol);
                  const displayName = formatStockLabel(r);
                  const showSymbol = r.symbol && displayName !== r.symbol;
                  return (
                    <tr key={`${r.symbol}-${i}`} className="border-t border-slate-100 hover:bg-teal-50/50">
                      <td className="px-4 py-3 font-medium text-slate-700">
                        <span className="inline-flex items-center gap-2 flex-wrap">
                          <span className="min-w-0">
                            <Link
                              to={stockPath(exchange, r.symbol || r.company)}
                              className="text-teal-700 hover:underline font-semibold block"
                            >
                              {displayName}
                            </Link>
                            {showSymbol && (
                              <span className="text-[11px] font-mono text-slate-500 mt-0.5 block">{r.symbol}</span>
                            )}
                          </span>
                          {exchange === 'PSX' && shariah && (
                            <span
                              className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200"
                              title="On PSX Shariah disclosure list (nature of business)"
                            >
                              Shariah
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">{formatNum(r.close)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${(r.change || 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {r.close != null ? (
                          <>
                            {(r.change || 0) >= 0 ? '+' : ''}{formatNum(r.change)}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${(r.changePct || 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {r.changePct != null ? (
                          <>
                            {(r.changePct || 0) >= 0 ? '+' : ''}{formatNum(r.changePct)}%
                          </>
                        ) : (
                          <span className="text-slate-400 text-xs">Pending ingest</span>
                        )}
                      </td>
                      <td
                        className={`px-4 py-3 text-right text-xs font-medium tabular-nums ${(r.weekChgPct || 0) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}
                      >
                        {typeof r.weekChgPct === 'number' ? (
                          <>{(r.weekChgPct >= 0 ? '+' : '')}{formatNum(r.weekChgPct)}%</>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-500">{formatNum(r.volume)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between bg-slate-50/50">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-2 rounded-xl bg-teal-50 text-teal-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-teal-100 border border-teal-200"
            >
              Previous
            </button>
            <span className="text-slate-600 text-sm">Page {page + 1} of {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-2 rounded-xl bg-teal-50 text-teal-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-teal-100 border border-teal-200"
            >
              Next
            </button>
          </div>
        )}
        <p className="px-4 py-3 text-xs text-slate-500 border-t border-slate-100 bg-slate-50/80 space-y-1">
          {exchange === 'PSX' ? (
            <>
              <span className="block">
                <strong className="text-slate-600">Week %</strong> uses{' '}
                <code className="text-[11px] bg-slate-200/80 px-1 rounded">daily_prices.csv</code>, updated by the PSX market closing prices workflow after each session.
              </span>
              <span className="block">
                <strong className="text-slate-600">Shariah filter</strong> uses the PSX list of companies required to file Shariah disclosures (
                {SHARIAH_LIST_META.symbolCount} symbols, notice dated {SHARIAH_LIST_META.asOf}).{' '}
                <a
                  href={SHARIAH_LIST_META.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal-700 font-medium hover:underline"
                >
                  View PSX notice (PDF)
                </a>
                . This reflects PSX &quot;nature of business&quot; classification, not personal fatwa or full Islamic finance screening.
              </span>
            </>
          ) : (
            <span className="block">
              <strong className="text-slate-600">{exchangeConfig.code}</strong> prices come from Supabase (
              <code className="text-[11px] bg-slate-200/80 px-1 rounded">daily_prices</code>
              ), populated by{' '}
              <code className="text-[11px] bg-slate-200/80 px-1 rounded">global-market-ingest</code> (curated
              leaders) after each market close. Company names are shown from the database or Yahoo Finance when
              symbols are numeric. Daily % and Week % are recomputed from saved closes (~7 calendar days for week).
              Shariah filter is PSX-only.
            </span>
          )}
        </p>
      </div>
      <Disclaimer />
    </div>
  );
}
