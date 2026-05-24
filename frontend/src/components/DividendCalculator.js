import { useState, useMemo, useRef } from 'react';
import { api } from '../api';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatRs(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return `Rs ${Number(n).toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
}

const emptyRow = () => ({ symbol: '', shares: '' });

export default function DividendCalculator({ symbolList = [] }) {
  const [mode, setMode] = useState('manual');
  const [rows, setRows] = useState([emptyRow(), emptyRow(), emptyRow()]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pdfName, setPdfName] = useState('');
  const fileRef = useRef(null);

  const symbols = useMemo(() => {
    const set = new Set(symbolList.map((s) => String(s).trim().toUpperCase()).filter(Boolean));
    return [...set].sort();
  }, [symbolList]);

  const maxMonthAmount = useMemo(() => {
    if (!result?.byMonth?.length) return 1;
    return Math.max(1, ...result.byMonth.map((m) => m.amount || 0));
  }, [result]);

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
        setRows(
          data.extractedHoldings.map((h) => ({
            symbol: h.symbol,
            shares: String(h.shares),
          }))
        );
      }
    } catch (err) {
      setResult(null);
      setError(err.response?.data?.error || err.message || 'PDF analysis failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section
      id="dividend-calculator"
      className="card overflow-hidden border-2 border-violet-200/70 shadow-lg shadow-violet-100/40 scroll-mt-24"
      data-ai-hint="Dividend calculator — enter holdings or upload a portfolio PDF"
    >
      <div className="px-5 sm:px-6 py-5 bg-gradient-to-br from-violet-600 via-purple-600 to-teal-600 text-white">
        <p className="text-[11px] font-bold uppercase tracking-widest text-violet-100 mb-1">Portfolio income</p>
        <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight">Dividend calculator</h3>
        <p className="mt-2 text-sm text-white/90 max-w-2xl leading-relaxed">
          Enter your PSX holdings or upload a broker portfolio PDF. We match symbols to DividendFlow&apos;s payout calendar
          and estimate <strong className="font-semibold">cash by payment month</strong> (Rs per share × your quantity).
        </p>
      </div>

      <div className="p-4 sm:p-6 space-y-5 bg-gradient-to-b from-violet-50/40 to-white">
        {/* Mode tabs */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode('manual')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              mode === 'manual'
                ? 'bg-violet-600 text-white shadow-md'
                : 'bg-white border border-slate-200 text-slate-600 hover:border-violet-300'
            }`}
          >
            Manual entry
          </button>
          <button
            type="button"
            onClick={() => setMode('pdf')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              mode === 'pdf'
                ? 'bg-violet-600 text-white shadow-md'
                : 'bg-white border border-slate-200 text-slate-600 hover:border-violet-300'
            }`}
          >
            Upload portfolio PDF
          </button>
        </div>

        {mode === 'manual' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              One row per stock. Symbols must match PSX tickers in our dividend dataset ({symbols.length} names loaded).
            </p>
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 text-left">
                    <th className="p-3 font-semibold">Symbol</th>
                    <th className="p-3 font-semibold">Shares</th>
                    <th className="p-3 w-16" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={idx} className="border-t border-slate-100">
                      <td className="p-2">
                        <input
                          list="psx-symbol-list"
                          value={row.symbol}
                          onChange={(e) => updateRow(idx, 'symbol', e.target.value.toUpperCase())}
                          placeholder="e.g. HBL"
                          className="w-full min-w-[100px] px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-violet-400/50 focus:outline-none uppercase"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={row.shares}
                          onChange={(e) => updateRow(idx, 'shares', e.target.value)}
                          placeholder="500"
                          className="w-full min-w-[90px] px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-violet-400/50 focus:outline-none"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeRow(idx)}
                          className="text-slate-400 hover:text-rose-500 text-lg leading-none px-2"
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
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={addRow} className="text-sm font-medium text-violet-700 hover:text-violet-900">
                + Add row
              </button>
              <button
                type="button"
                onClick={runManual}
                disabled={loading}
                className="btn-primary ml-auto px-6 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 shadow-violet-300/40"
              >
                {loading ? 'Calculating…' : 'Calculate dividends'}
              </button>
            </div>
          </div>
        )}

        {mode === 'pdf' && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600 leading-relaxed">
              Upload a text-based portfolio or CDC/broker statement PDF. We extract symbols and quantities (Groq AI when
              available, otherwise pattern matching), then run the same dividend projection.
            </p>
            <label
              className={`flex flex-col items-center justify-center gap-2 p-8 rounded-2xl border-2 border-dashed cursor-pointer transition-colors ${
                loading
                  ? 'border-violet-200 bg-violet-50/50 opacity-70 pointer-events-none'
                  : 'border-violet-300 bg-white hover:bg-violet-50/30 hover:border-violet-400'
              }`}
            >
              <span className="text-3xl" aria-hidden>
                📄
              </span>
              <span className="font-semibold text-slate-700">
                {pdfName || 'Choose portfolio PDF'}
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
              <p className="text-sm text-violet-700 text-center animate-pulse">Parsing PDF and matching dividends…</p>
            )}
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">{error}</div>
        )}

        {result && (
          <div className="space-y-5 pt-2 border-t border-slate-200">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Estimated annual dividends</p>
                <p className="text-3xl sm:text-4xl font-extrabold text-violet-700">{formatRs(result.totalAnnual)}</p>
              </div>
              {result.extractionMethod && (
                <span className="text-xs px-3 py-1 rounded-full bg-slate-100 text-slate-600">
                  PDF parsed via {result.extractionMethod === 'groq' ? 'AI' : 'pattern match'}
                  {result.pdfPages ? ` · ${result.pdfPages} page(s)` : ''}
                </span>
              )}
            </div>

            {result.unmatched?.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-950">
                <p className="font-semibold mb-1">Not matched in dividend dataset</p>
                <p>{result.unmatched.map((u) => `${u.symbol} (${u.shares} sh)`).join(', ')}</p>
              </div>
            )}

            {/* Monthly chart */}
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-3">Expected cash by payment month</p>
              <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5 sm:gap-2">
                {result.byMonth.map((m) => {
                  const pct = m.amount > 0 ? Math.max(8, (m.amount / maxMonthAmount) * 100) : 4;
                  const hasPay = m.amount > 0;
                  return (
                    <div key={m.month} className="flex flex-col items-center gap-1">
                      <div
                        className={`w-full rounded-t-lg min-h-[4px] transition-all ${
                          hasPay ? 'bg-gradient-to-t from-violet-600 to-teal-400' : 'bg-slate-200'
                        }`}
                        style={{ height: `${Math.min(80, pct)}px` }}
                        title={`${m.monthName}: ${formatRs(m.amount)}`}
                      />
                      <span className={`text-[10px] font-bold ${hasPay ? 'text-violet-700' : 'text-slate-400'}`}>
                        {MONTH_SHORT[m.month - 1]}
                      </span>
                      {hasPay && (
                        <span className="text-[9px] text-slate-500 text-center leading-tight hidden sm:block">
                          {m.amount >= 1000 ? `${(m.amount / 1000).toFixed(1)}k` : m.amount}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Detail table */}
            {result.lineItems?.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 text-left">
                      <th className="p-3 font-semibold">Symbol</th>
                      <th className="p-3 font-semibold">Month</th>
                      <th className="p-3 font-semibold">Type</th>
                      <th className="p-3 font-semibold">Dividend/sh</th>
                      <th className="p-3 font-semibold">Shares</th>
                      <th className="p-3 font-semibold text-right">Cash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.lineItems.map((item, i) => (
                      <tr key={`${item.symbol}-${item.paymentMonth}-${i}`} className="border-t border-slate-100">
                        <td className="p-3 font-medium text-slate-800">{item.symbol}</td>
                        <td className="p-3 text-slate-600">{item.monthName}</td>
                        <td className="p-3">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-md font-medium ${
                              item.type === 'Final' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {item.type}
                          </span>
                        </td>
                        <td className="p-3">{item.dividendPerShare}</td>
                        <td className="p-3">{item.shares.toLocaleString('en-PK')}</td>
                        <td className="p-3 text-right font-semibold text-violet-700">{formatRs(item.cash)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-[11px] text-slate-500 leading-relaxed">{result.disclaimer}</p>
          </div>
        )}
      </div>
    </section>
  );
}
