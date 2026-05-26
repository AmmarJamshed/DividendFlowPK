import { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../api';

const LOGO = `${process.env.PUBLIC_URL || ''}/dividendflow-logo.png`;

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatRs(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return `Rs ${Number(n).toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
}

function formatCompactRs(n) {
  if (n == null || Number.isNaN(n) || n <= 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

const emptyRow = () => ({ symbol: '', shares: '' });

function SummaryStat({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm border-t-2 border-t-violet-400 hover:-translate-y-0.5 transition-transform">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1 tabular-nums">{value}</p>
      {sub && <p className="text-xs mt-1 text-slate-600">{sub}</p>}
    </div>
  );
}

function CalculatorResults({ result }) {
  const [showAllRows, setShowAllRows] = useState(false);
  const [monthFilter, setMonthFilter] = useState('all');

  const maxMonthAmount = useMemo(() => {
    if (!result?.byMonth?.length) return 1;
    return Math.max(1, ...result.byMonth.map((m) => m.amount || 0));
  }, [result]);

  const stats = useMemo(() => {
    const matched = result.matched?.length ?? 0;
    const unmatched = result.unmatched?.length ?? 0;
    const payoutCount = result.lineItems?.length ?? 0;
    const activeMonths = result.byMonth?.filter((m) => m.amount > 0).length ?? 0;
    const topMonth = [...(result.byMonth || [])].sort((a, b) => b.amount - a.amount)[0];
    return { matched, unmatched, payoutCount, activeMonths, topMonth };
  }, [result]);

  const filteredRows = useMemo(() => {
    let rows = [...(result.lineItems || [])].sort((a, b) => b.cash - a.cash);
    if (monthFilter !== 'all') {
      rows = rows.filter((r) => String(r.paymentMonth) === monthFilter);
    }
    return rows;
  }, [result.lineItems, monthFilter]);

  const visibleRows = showAllRows ? filteredRows : filteredRows.slice(0, 8);

  return (
    <div className="space-y-6 pt-6 mt-6 border-t-2 border-slate-200">
      <div className="rounded-xl bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 border border-slate-200 p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-teal-600">Your portfolio projection</p>
            <p className="text-4xl sm:text-5xl font-extrabold text-slate-900 mt-1 tabular-nums">
              {formatRs(result.totalAnnual)}
            </p>
            <p className="text-sm text-slate-600 mt-2 max-w-xl">
              Estimated annual dividend cash from saved PSX payout data × your share counts. Not a guarantee of future payouts.
            </p>
          </div>
          {result.extractionMethod && (
            <span className="self-start lg:self-center shrink-0 text-xs font-medium px-3 py-1.5 rounded-full bg-white border border-amber-200 text-amber-900 shadow-sm">
              PDF · {result.extractionMethod === 'groq' ? 'AI extract' : 'pattern match'}
              {result.pdfPages ? ` · ${result.pdfPages} pg` : ''}
            </span>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryStat label="Stocks matched" value={stats.matched} sub="with dividend rows" />
        <SummaryStat label="Payout lines" value={stats.payoutCount} sub="interim + final" />
        <SummaryStat label="Active months" value={stats.activeMonths} sub="with cash expected" />
        <SummaryStat
          label="Peak month"
          value={stats.topMonth?.amount > 0 ? formatCompactRs(stats.topMonth.amount) : '—'}
          sub={stats.topMonth?.amount > 0 ? stats.topMonth.monthName : 'No payouts'}
        />
      </div>

      {result.unmatched?.length > 0 && (
        <div className="rounded-2xl bg-amber-50/90 border border-amber-200 p-4">
          <p className="text-sm font-bold text-amber-900 flex items-center gap-2">
            <span aria-hidden>⚠</span>
            {stats.unmatched} holding{stats.unmatched !== 1 ? 's' : ''} not in dividend dataset
          </p>
          <p className="text-xs text-amber-800/90 mt-2 leading-relaxed">
            These symbols were read from your input but have no payout row in DividendFlow yet — they are excluded from the total above.
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            {result.unmatched.map((u) => (
              <span
                key={u.symbol}
                className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-white border border-amber-200 text-amber-900"
              >
                {u.symbol} · {Number(u.shares).toLocaleString('en-PK')} sh
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Monthly chart */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-5">
          <div>
            <h4 className="text-base font-bold text-slate-800">Cash by payment month</h4>
            <p className="text-xs text-slate-500 mt-0.5">When dividends are expected to land in your account</p>
          </div>
          <p className="text-xs text-slate-500">Based on historical payment months in dataset</p>
        </div>
        <div className="flex items-end justify-between gap-1 sm:gap-2 h-36 sm:h-44 px-1">
          {result.byMonth.map((m) => {
            const hasPay = m.amount > 0;
            const pct = hasPay ? Math.max(12, (m.amount / maxMonthAmount) * 100) : 6;
            const isPeak = hasPay && m.amount === maxMonthAmount;
            return (
              <button
                key={m.month}
                type="button"
                onClick={() => setMonthFilter(monthFilter === String(m.month) ? 'all' : String(m.month))}
                className={`group flex-1 min-w-0 flex flex-col items-center justify-end gap-1.5 h-full rounded-lg transition-colors ${
                  monthFilter === String(m.month) ? 'bg-slate-100 ring-2 ring-teal-600/40 ring-offset-1' : 'hover:bg-slate-50'
                }`}
                title={`${m.monthName}: ${formatRs(m.amount)}`}
              >
                {hasPay && (
                  <span className="text-[9px] sm:text-[10px] font-bold text-teal-600 opacity-0 group-hover:opacity-100 sm:opacity-100 transition-opacity truncate max-w-full px-0.5">
                    {formatCompactRs(m.amount)}
                  </span>
                )}
                <div
                  className={`w-full max-w-[2.5rem] mx-auto rounded-t-md transition-all ${
                    hasPay
                      ? isPeak
                        ? 'bg-gradient-to-t from-teal-800 via-teal-600 to-emerald-500 shadow-md'
                        : 'bg-gradient-to-t from-teal-600 to-emerald-500'
                      : 'bg-slate-100'
                  }`}
                  style={{ height: `${pct}%`, minHeight: hasPay ? '8px' : '4px' }}
                />
                <span className={`text-[10px] sm:text-xs font-bold ${hasPay ? 'text-teal-800' : 'text-slate-400'}`}>
                  {MONTH_SHORT[m.month - 1]}
                </span>
              </button>
            );
          })}
        </div>
        {monthFilter !== 'all' && (
          <button
            type="button"
            onClick={() => setMonthFilter('all')}
            className="mt-3 text-xs font-semibold text-teal-600 hover:underline"
          >
            Clear month filter · show all payouts
          </button>
        )}
      </div>

      {/* Payout table */}
      {filteredRows.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <div className="px-4 sm:px-5 py-4 border-b border-slate-100 bg-slate-50/80 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-base font-bold text-slate-800">Payout breakdown</h4>
              <p className="text-xs text-slate-500">
                {monthFilter === 'all'
                  ? `${filteredRows.length} line${filteredRows.length !== 1 ? 's' : ''} · sorted by cash`
                  : `${MONTH_SHORT[parseInt(monthFilter, 10) - 1]} only · ${filteredRows.length} line${filteredRows.length !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-white">
                  <th className="px-4 py-3 font-semibold">Symbol</th>
                  <th className="px-4 py-3 font-semibold">Month</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold hidden sm:table-cell">Div/share</th>
                  <th className="px-4 py-3 font-semibold hidden md:table-cell">Shares</th>
                  <th className="px-4 py-3 font-semibold text-right">Cash</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((item, i) => (
                  <tr
                    key={`${item.symbol}-${item.paymentMonth}-${i}`}
                    className="border-t border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="font-bold text-slate-800">{item.symbol}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item.monthName?.slice(0, 3) || item.monthName}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-md font-semibold ${
                          item.type === 'Final' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'
                        }`}
                      >
                        {item.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 hidden sm:table-cell tabular-nums">{item.dividendPerShare}</td>
                    <td className="px-4 py-3 text-slate-600 hidden md:table-cell tabular-nums">
                      {item.shares.toLocaleString('en-PK')}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-700 tabular-nums">{formatRs(item.cash)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredRows.length > 8 && (
            <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50 text-center">
              <button
                type="button"
                onClick={() => setShowAllRows((v) => !v)}
                className="text-sm font-semibold text-teal-600 hover:underline"
              >
                {showAllRows ? 'Show less' : `Show all ${filteredRows.length} payouts`}
              </button>
            </div>
          )}
        </div>
      )}

      <p className="text-[11px] text-slate-500 leading-relaxed px-1">{result.disclaimer}</p>
    </div>
  );
}

export default function DividendCalculator({ symbolList = [] }) {
  const [mode, setMode] = useState('manual');
  const [rows, setRows] = useState([emptyRow(), emptyRow(), emptyRow()]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pdfName, setPdfName] = useState('');
  const [marketSymbolCount, setMarketSymbolCount] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    api
      .getMarketClosingPrices()
      .then((res) => setMarketSymbolCount((res.data?.rows || []).length))
      .catch(() => setMarketSymbolCount(null));
  }, []);

  const symbols = useMemo(() => {
    const set = new Set(symbolList.map((s) => String(s).trim().toUpperCase()).filter(Boolean));
    return [...set].sort();
  }, [symbolList]);

  const filledRows = useMemo(
    () => rows.filter((r) => r.symbol.trim() && parseFloat(r.shares) > 0).length,
    [rows]
  );

  const updateRow = (idx, field, value) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  const addRow = () => setRows((prev) => [...prev, emptyRow()]);

  const removeRow = (idx) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  };

  const buildHoldings = () =>
    rows
      .map((r) => ({
        symbol: String(r.symbol || '').trim().toUpperCase(),
        shares: parseFloat(r.shares) || 0,
      }))
      .filter((h) => h.symbol && h.shares > 0);

  const runManual = async () => {
    const holdings = buildHoldings();
    if (!holdings.length) {
      setError('Add at least one symbol and share count.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.postDividendCalculator(holdings);
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(err.response?.data?.error || err.message || 'Calculation failed');
    } finally {
      setLoading(false);
    }
  };

  const runPdf = async (file) => {
    if (!file) return;
    setPdfName(file.name);
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const { data } = await api.postDividendCalculatorPdf(file);
      setResult(data);
      if (data.extractedHoldings?.length) {
        setRows(data.extractedHoldings.map((h) => ({ symbol: h.symbol, shares: String(h.shares) })));
        setMode('manual');
      }
    } catch (err) {
      setResult(null);
      const data = err.response?.data;
      let msg = data?.error || err.message || 'PDF analysis failed';
      if (data?.textPreview) msg += `\n\nExtracted text preview:\n${data.textPreview}`;
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section
      id="dividend-calculator"
      className="card overflow-hidden scroll-mt-24 border border-slate-200"
      data-ai-hint="Dividend calculator — enter holdings or upload a portfolio PDF"
    >
      <div className="fin-hero fin-hero--teal px-5 sm:px-6 py-5 relative rounded-t-2xl">
        <img src={LOGO} alt="" className="absolute right-4 top-4 w-16 opacity-30 pointer-events-none" aria-hidden />
        <div className="relative z-[1]">
          <p className="text-[11px] font-bold uppercase tracking-widest text-amber-100 mb-1">Portfolio income</p>
          <h3 className="text-xl sm:text-2xl font-bold tracking-tight">Dividend calculator</h3>
          <p className="mt-2 text-sm text-slate-200 max-w-2xl leading-relaxed">
            Enter PSX tickers and share counts, or upload a broker portfolio PDF. See estimated cash by payment month.
          </p>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-5 bg-slate-50/50">
        {/* Segmented control */}
        <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200/80">
          <button
            type="button"
            onClick={() => setMode('manual')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              mode === 'manual' ? 'bg-white text-teal-600 shadow-sm ring-1 ring-violet-400/40' : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            Manual entry
          </button>
          <button
            type="button"
            onClick={() => setMode('pdf')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              mode === 'pdf' ? 'bg-white text-teal-600 shadow-sm ring-1 ring-violet-400/40' : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            Upload PDF
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Dividend universe</p>
            <p className="text-lg font-bold text-slate-900 tabular-nums">{symbols.length} symbols</p>
            <p className="text-xs text-slate-500 mt-1">Companies with payout records in our calendar file</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Full market board</p>
            <p className="text-lg font-bold text-slate-900 tabular-nums">
              {marketSymbolCount != null ? marketSymbolCount : '—'} symbols
            </p>
            <p className="text-xs text-slate-500 mt-1">All listings in latest closing-price scrape</p>
          </div>
        </div>

        {mode === 'manual' && (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 sm:px-5 py-3 border-b border-slate-100 bg-slate-50/80 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-slate-600">Autocomplete uses dividend-paying symbols only</p>
              {filledRows > 0 && (
                <span className="badge-pill bg-emerald-50 text-emerald-800 border-emerald-200">
                  {filledRows} row{filledRows !== 1 ? 's' : ''} ready
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-100">
                    <th className="px-4 py-3 font-semibold w-[45%]">Symbol</th>
                    <th className="px-4 py-3 font-semibold">Shares held</th>
                    <th className="px-4 py-3 w-12" aria-label="Remove" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={idx} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-2">
                        <input
                          list="psx-symbol-list"
                          value={row.symbol}
                          onChange={(e) => updateRow(idx, 'symbol', e.target.value.toUpperCase())}
                          placeholder="HBL"
                          autoComplete="off"
                          spellCheck={false}
                          className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-teal-600/30 focus:border-teal-600 focus:outline-none uppercase font-semibold text-slate-800 placeholder:font-normal placeholder:text-slate-400"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={row.shares}
                          onChange={(e) => updateRow(idx, 'shares', e.target.value)}
                          placeholder="500"
                          className="w-full max-w-[140px] px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-teal-600/30 focus:border-teal-600 focus:outline-none tabular-nums text-slate-800 placeholder:text-slate-400"
                        />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeRow(idx)}
                          className="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          aria-label="Remove row"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <datalist id="psx-symbol-list">
              {symbols.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>

            <div className="px-4 sm:px-5 py-4 border-t border-slate-100 bg-slate-50/50 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={addRow}
                className="text-sm font-semibold text-teal-600 hover:underline px-3 py-2"
              >
                + Add row
              </button>
              <button
                type="button"
                onClick={runManual}
                disabled={loading || filledRows === 0}
                className="btn-primary ml-auto px-8 py-2.5 disabled:opacity-50"
              >
                {loading ? 'Calculating…' : 'Calculate dividends'}
              </button>
            </div>
          </div>
        )}

        {mode === 'pdf' && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm space-y-4">
            <div>
              <h4 className="text-sm font-bold text-slate-800">Broker portfolio statement</h4>
              <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                Upload a text-based CDC or broker PDF (e.g. Client Portfolio Position Report). We read symbols and quantities, then fill the table above.
              </p>
            </div>
            <label
              className={`flex flex-col items-center justify-center gap-3 py-10 px-6 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${
                loading
                  ? 'border-slate-200 bg-slate-50 opacity-70 pointer-events-none'
                  : pdfName
                    ? 'border-emerald-300 bg-emerald-50/50 hover:border-emerald-400'
                    : 'border-violet-400/50 bg-amber-50/30 hover:bg-amber-50/60 hover:border-violet-400'
              }`}
            >
              <span className="text-sm font-bold uppercase tracking-wide text-teal-600" aria-hidden>
                {pdfName ? 'Ready' : 'PDF'}
              </span>
              <span className="font-semibold text-slate-800 text-center break-all max-w-md">
                {pdfName || 'Drop PDF here or click to browse'}
              </span>
              <span className="text-xs text-slate-500">Max 8 MB · PDF only</span>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                disabled={loading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) runPdf(f);
                  e.target.value = '';
                }}
              />
            </label>
            {loading && (
              <div className="flex items-center justify-center gap-3 text-sm text-teal-600">
                <div className="w-5 h-5 border-2 border-slate-200 border-t-teal-600 rounded-full animate-spin" />
                Parsing PDF and matching dividends…
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm whitespace-pre-wrap leading-relaxed">
            {error}
          </div>
        )}

        {result && <CalculatorResults result={result} />}
      </div>
    </section>
  );
}
