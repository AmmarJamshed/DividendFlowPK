import { useState, useEffect, useMemo } from 'react';
import { api } from '../api';

const PAGE_SIZE = 25;

function formatNum(n) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-PK', { maximumFractionDigits: 2 });
}

function AICommentary({ summary }) {
  if (!summary) return null;
  const { totalCompanies, topGainer, topLoser, date } = summary;
  const sentiment = totalCompanies > 0
    ? topGainer?.changePct > 0 && (!topLoser || Math.abs(topGainer.changePct) >= Math.abs(topLoser.changePct))
      ? 'Moderately positive'
      : topLoser?.changePct < 0 && (!topGainer || Math.abs(topLoser.changePct) >= Math.abs(topGainer.changePct))
        ? 'Cautious'
        : 'Mixed'
    : 'No data';
  const sectorNote = topGainer?.changePct > 2 ? ' with strong activity in select sectors.' : '.';

  return (
    <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-4 sm:p-6 mb-6">
      <h3 className="text-lg font-semibold text-teal-300 mb-3 flex items-center gap-2">
        <span className="w-8 h-8 rounded-lg bg-teal-500/20 flex items-center justify-center text-teal-400">🤖</span>
        AI Market Summary
      </h3>
      <p className="text-slate-300 text-sm leading-relaxed">
        {date ? `As of ${date}: ` : ''}
        Today&apos;s Pakistan Stock Exchange session closed {sentiment.toLowerCase()}{sectorNote}
        {' '}Total companies traded: <strong className="text-slate-200">{formatNum(totalCompanies)}</strong>.
        {topGainer && (
          <> Top performer: <strong className="text-emerald-400">{topGainer.symbol} +{topGainer.changePct.toFixed(1)}%</strong>.</>
        )}
        {topLoser && (
          <> Worst performer: <strong className="text-red-400">{topLoser.symbol} {topLoser.changePct.toFixed(1)}%</strong>.</>
        )}
        {' '}Overall market sentiment: <strong className="text-slate-200">{sentiment}</strong>.
      </p>
    </div>
  );
}

export default function MarketClosingPrices() {
  const [data, setData] = useState({ rows: [], date: null, summary: null });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: 'changePct', dir: 'desc' });
  const [page, setPage] = useState(0);

  useEffect(() => {
    api.getMarketClosingPrices()
      .then(res => setData(res.data))
      .catch(() => setData({ rows: [], date: null, summary: null }))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = data.rows || [];
    const q = (search || '').trim().toLowerCase();
    if (q) list = list.filter(r => (r.symbol || '').toLowerCase().includes(q) || (r.company || '').toLowerCase().includes(q));
    const k = sort.key;
    const d = sort.dir === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => {
      const va = a[k];
      const vb = b[k];
      if (typeof va === 'number' && typeof vb === 'number') return d * (va - vb);
      return d * String(va || '').localeCompare(String(vb || ''));
    });
    return list;
  }, [data.rows, search, sort]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSort = (key) => {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
    setPage(0);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="animate-spin w-10 h-10 border-2 border-teal-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div>
      <AICommentary summary={data.summary} />
      <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 overflow-hidden">
        <div className="p-4 border-b border-slate-700/50 flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center">
          <input
            type="search"
            placeholder="Search by stock or symbol..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="px-4 py-2 rounded-lg bg-slate-900 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 w-full sm:w-64"
          />
          <span className="text-sm text-slate-400 self-center">
            {filtered.length} stocks
            {data.date && ` • ${data.date}`}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/80 text-slate-400">
                <th className="text-left px-4 py-3 font-medium cursor-pointer hover:text-teal-400" onClick={() => toggleSort('symbol')}>Stock</th>
                <th className="text-right px-4 py-3 font-medium cursor-pointer hover:text-teal-400" onClick={() => toggleSort('close')}>Close</th>
                <th className="text-right px-4 py-3 font-medium cursor-pointer hover:text-teal-400" onClick={() => toggleSort('change')}>Change</th>
                <th className="text-right px-4 py-3 font-medium cursor-pointer hover:text-teal-400" onClick={() => toggleSort('changePct')}>Daily %</th>
                <th className="text-right px-4 py-3 font-medium cursor-pointer hover:text-teal-400" onClick={() => toggleSort('volume')}>Shares Traded</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No data available</td></tr>
              ) : (
                pageRows.map((r, i) => (
                  <tr key={`${r.symbol}-${i}`} className="border-t border-slate-700/50 hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-medium text-slate-200">{r.symbol || r.company}</td>
                    <td className="px-4 py-3 text-right text-slate-300">{formatNum(r.close)}</td>
                    <td className={`px-4 py-3 text-right font-medium ${(r.change || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {(r.change || 0) >= 0 ? '+' : ''}{formatNum(r.change)}
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${(r.changePct || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {(r.changePct || 0) >= 0 ? '+' : ''}{formatNum(r.changePct)}%
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">{formatNum(r.volume)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-700/50 flex items-center justify-between">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 rounded-lg bg-slate-700/50 text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-700"
            >
              Previous
            </button>
            <span className="text-slate-400 text-sm">Page {page + 1} of {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1.5 rounded-lg bg-slate-700/50 text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-700"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
