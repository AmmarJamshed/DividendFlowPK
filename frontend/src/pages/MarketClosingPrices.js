import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useExchange } from '../context/ExchangeContext';
import { stockPath } from '../config/exchanges';
import { isShariahCompliant, SHARIAH_LIST_META } from '../utils/psxShariah';
import Disclaimer from '../components/Disclaimer';
import CompanyLogo from '../components/CompanyLogo';
import MarketIndexChart from '../components/MarketIndexChart';
import MarketMoversPanel from '../components/MarketMoversPanel';

const PAGE_SIZE = 25;

function formatNum(n) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-PK', { maximumFractionDigits: 2 });
}

function formatPct(n) {
  if (n == null || isNaN(n)) return '—';
  const v = Number(n);
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

function formatCap(n) {
  if (n == null || isNaN(n) || n <= 0) return '—';
  const v = Number(n);
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  return formatNum(v);
}

function formatStockLabel(row) {
  if (!row) return '—';
  const sym = row.symbol || '';
  const name = (row.company || '').trim();
  if (name && name !== sym && !/^\d+$/.test(name)) return name;
  return sym || '—';
}

export default function MarketClosingPrices() {
  const { exchange, exchangeConfig } = useExchange();
  const [data, setData] = useState({ rows: [], date: null, summary: null });
  const [indexSeries, setIndexSeries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [indexLoading, setIndexLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [shariahOnly, setShariahOnly] = useState(false);
  const [sort, setSort] = useState({ key: 'changePct', dir: 'desc' });
  const [page, setPage] = useState(0);

  useEffect(() => {
    setLoading(true);
    setPage(0);
    api
      .getMarketClosingPrices(exchange)
      .then((res) => setData(res.data || { rows: [], date: null, summary: null, meta: null }))
      .catch(() => setData({ rows: [], date: null, summary: null }))
      .finally(() => setLoading(false));
  }, [exchange]);

  useEffect(() => {
    if (exchange !== 'PSX') {
      setIndexSeries(null);
      setIndexLoading(false);
      return;
    }
    setIndexLoading(true);
    api
      .getMarketIndex('PSX', 180)
      .then((res) => setIndexSeries(res.data))
      .catch(() => setIndexSeries(null))
      .finally(() => setIndexLoading(false));
  }, [exchange]);

  const shariahInDataset = useMemo(() => {
    let n = 0;
    for (const r of data.rows || []) {
      if (isShariahCompliant(r.symbol)) n += 1;
    }
    return n;
  }, [data.rows]);

  const gainers = useMemo(
    () =>
      [...(data.rows || [])]
        .filter((r) => typeof r.changePct === 'number' && r.changePct > 0)
        .sort((a, b) => b.changePct - a.changePct)
        .slice(0, 4),
    [data.rows]
  );

  const losers = useMemo(
    () =>
      [...(data.rows || [])]
        .filter((r) => typeof r.changePct === 'number' && r.changePct < 0)
        .sort((a, b) => a.changePct - b.changePct)
        .slice(0, 4),
    [data.rows]
  );

  const filtered = useMemo(() => {
    let list = data.rows || [];
    if (shariahOnly) list = list.filter((r) => isShariahCompliant(r.symbol));
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
      if (typeof va === 'number' && typeof vb === 'number') return d * (va - vb);
      return d * String(va || '').localeCompare(String(vb || ''));
    });
    return list;
  }, [data.rows, search, sort, shariahOnly]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSort = (key) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));
    setPage(0);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="animate-spin w-10 h-10 border-2 border-[#1E3A8A] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="df-page">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 df-card p-4 sm:p-5">
          <MarketIndexChart series={indexSeries} loading={indexLoading} />
        </div>
        <div className="space-y-4">
          <MarketMoversPanel title="Top Gainers" rows={gainers} exchange={exchange} />
          <MarketMoversPanel title="Top Losers" rows={losers} exchange={exchange} />
        </div>
      </div>

      <div className="df-card overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            type="search"
            placeholder="Search by stock or symbol…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="input-field max-w-md"
          />
          <span className="text-sm text-slate-500">
            {filtered.length} stocks
            {data.date && ` · Close ${data.date}`}
          </span>
        </div>

        {exchange === 'PSX' && (
          <div className="px-4 py-2 border-b border-slate-100 flex flex-wrap items-center gap-2 bg-slate-50/60">
            <button
              type="button"
              onClick={() => {
                setShariahOnly(false);
                setPage(0);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                !shariahOnly ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]' : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              All PSX
            </button>
            <button
              type="button"
              onClick={() => {
                setShariahOnly(true);
                setPage(0);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                shariahOnly ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              Shariah only
            </button>
            <span className="text-xs text-slate-500">{shariahInDataset} on PSX Shariah list</span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#1E3A8A] text-white text-left text-[11px] font-semibold uppercase tracking-wide">
                <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('company')}>
                  Company
                </th>
                <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('symbol')}>
                  Ticker
                </th>
                <th className="px-4 py-3 text-right cursor-pointer" onClick={() => toggleSort('close')}>
                  Price
                </th>
                <th className="px-4 py-3 text-right cursor-pointer" onClick={() => toggleSort('changePct')}>
                  Change
                </th>
                <th className="px-4 py-3 text-right cursor-pointer" onClick={() => toggleSort('marketCap')}>
                  Mkt Cap
                </th>
                <th className="px-4 py-3 text-right cursor-pointer" onClick={() => toggleSort('peRatio')}>
                  P/E
                </th>
                <th className="px-4 py-3 text-right cursor-pointer" onClick={() => toggleSort('dividendYield')}>
                  Dividend Yield
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    No data available for this filter.
                  </td>
                </tr>
              ) : (
                pageRows.map((r, i) => {
                  const positive = (r.changePct || 0) >= 0;
                  const zebra = i % 2 === 1 ? 'bg-slate-50/70' : 'bg-white';
                  return (
                    <tr key={`${r.symbol}-${i}`} className={`${zebra} df-table-row`}>
                      <td className="px-4 py-3">
                        <Link
                          to={stockPath(exchange, r.symbol)}
                          className="inline-flex items-center gap-2.5 font-medium text-slate-800 hover:text-[#1E3A8A]"
                        >
                          <CompanyLogo symbol={r.symbol} className="w-8 h-8" />
                          <span className="min-w-0 truncate max-w-[200px]">{formatStockLabel(r)}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-600">{r.symbol}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-800">{formatNum(r.close)}</td>
                      <td
                        className={`px-4 py-3 text-right font-semibold tabular-nums ${
                          positive ? 'text-emerald-600' : 'text-red-600'
                        }`}
                      >
                        {r.changePct != null ? formatPct(r.changePct) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{formatCap(r.marketCap)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{formatNum(r.peRatio)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                        {r.dividendYield != null ? `${formatNum(r.dividendYield)}%` : '—'}
                      </td>
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
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="df-btn-outline px-3 py-2 text-xs disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-slate-600 text-sm">
              Page {page + 1} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="df-btn-outline px-3 py-2 text-xs disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}

        {exchange === 'PSX' && (
          <p className="px-4 py-3 text-xs text-slate-500 border-t border-slate-100 bg-slate-50/80">
            Shariah filter uses the PSX disclosure list ({SHARIAH_LIST_META.symbolCount} symbols,{' '}
            {SHARIAH_LIST_META.asOf}). Dividend yield from calendar files; P/E and market cap when available in cloud
            metrics. Logos from public symbol artwork where available.
          </p>
        )}
      </div>
      <Disclaimer />
    </div>
  );
}
