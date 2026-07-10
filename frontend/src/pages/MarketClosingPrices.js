import { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import { useExchange } from '../context/ExchangeContext';
import { isShariahCompliant, SHARIAH_LIST_META } from '../utils/psxShariah';
import Disclaimer from '../components/Disclaimer';
import MarketIndexChart from '../components/MarketIndexChart';
import MarketMoversPanel from '../components/MarketMoversPanel';
import StockBusinessCard from '../components/StockBusinessCard';

const PAGE_SIZE = 24;

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

      <section className="df-card overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Company cards</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {filtered.length} stocks
              {data.date && ` · Close ${data.date}`} · {exchangeConfig.currency}
            </p>
          </div>
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
        </div>

        <div className="px-4 py-2 border-b border-slate-100 flex flex-wrap items-center gap-2 bg-slate-50/60">
          {exchange === 'PSX' && (
            <>
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
              <span className="text-xs text-slate-500 mr-2">{shariahInDataset} on Shariah list</span>
            </>
          )}
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Sort</span>
          {[
            { key: 'changePct', label: 'Change %' },
            { key: 'close', label: 'Price' },
            { key: 'symbol', label: 'Ticker' },
            { key: 'company', label: 'Name' },
          ].map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => {
                setSort((s) =>
                  s.key === opt.key ? { key: opt.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: opt.key, dir: 'desc' }
                );
                setPage(0);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                sort.key === opt.key
                  ? 'bg-white text-[#1E3A8A] border-[#1E3A8A]'
                  : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              {opt.label}
              {sort.key === opt.key ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
            </button>
          ))}
        </div>

        {pageRows.length === 0 ? (
          <p className="px-4 py-12 text-center text-slate-500 text-sm">No data available for this filter.</p>
        ) : (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {pageRows.map((r, i) => (
              <StockBusinessCard key={`${r.symbol}-${i}`} row={r} exchange={exchange} />
            ))}
          </div>
        )}

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
            {SHARIAH_LIST_META.asOf}). Logos use scraped company artwork where available; futures symbols reuse the
            underlying equity logo.
          </p>
        )}
      </section>
      <Disclaimer />
    </div>
  );
}
