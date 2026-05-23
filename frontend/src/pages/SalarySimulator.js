import { useState } from 'react';
import { api } from '../api';
import Disclaimer from '../components/Disclaimer';

function formatRs(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString('en-PK', { maximumFractionDigits: 0 });
}

export default function SalarySimulator() {
  const [targetIncome, setTargetIncome] = useState(100000);
  const [yieldPct, setYieldPct] = useState(6);
  const [shariahOnly, setShariahOnly] = useState(false);
  const [result, setResult] = useState(null);
  const [aiAdvice, setAiAdvice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const fetchAiAdvice = (calc) => {
    setAiLoading(true);
    setAiAdvice(null);
    api
      .postSalaryAiRecommendations({
        targetMonthlyIncome: calc.targetMonthlyIncome,
        expectedDividendYield: calc.expectedDividendYield,
        requiredPortfolioValue: calc.requiredPortfolioValue,
        shariahOnly,
      })
      .then((res) => setAiAdvice(res.data))
      .catch((err) => {
        setAiAdvice({
          ok: false,
          error:
            err.response?.data?.error ||
            (err.response?.status === 429
              ? 'Please wait a moment before requesting AI again.'
              : 'Could not load AI recommendations.'),
        });
      })
      .finally(() => setAiLoading(false));
  };

  const calculate = () => {
    setLoading(true);
    setResult(null);
    setAiAdvice(null);
    api
      .getSalarySimulator(targetIncome, yieldPct)
      .then((res) => {
        setResult(res.data);
        fetchAiAdvice(res.data);
      })
      .catch((err) => setResult({ error: err.message }))
      .finally(() => setLoading(false));
  };

  const refreshAi = () => {
    if (result && !result.error) fetchAiAdvice(result);
  };

  return (
    <div className="space-y-8">
      <div className="card p-4 sm:p-6 lg:p-8 max-w-xl">
        <h3 className="card-header text-lg">Salary Replacement Simulator</h3>
        <p className="card-subtitle mb-6">
          Estimate the portfolio value needed to replace your salary with dividend income, then get AI ideas on how
          many PSX names to hold and how to split the amount using today&apos;s saved news and dividend data.
        </p>
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-2">Target Monthly Income (Rs)</label>
            <input
              type="number"
              value={targetIncome}
              onChange={(e) => setTargetIncome(Number(e.target.value))}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-2">Expected Dividend Yield (%)</label>
            <input
              type="number"
              value={yieldPct}
              onChange={(e) => setYieldPct(Number(e.target.value))}
              step="0.5"
              className="input-field"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={shariahOnly}
              onChange={(e) => setShariahOnly(e.target.checked)}
              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            Prefer PSX Shariah disclosure list only (for AI picks)
          </label>
          <button onClick={calculate} disabled={loading || aiLoading} className="btn-primary w-full py-3">
            {loading ? 'Calculating…' : aiLoading ? 'Loading AI ideas…' : 'Calculate & get AI allocation ideas'}
          </button>
        </div>
      </div>

      {result && !result.error && (
        <div className="card p-4 sm:p-6 lg:p-8 max-w-3xl border-teal-500/30">
          <h3 className="card-header text-lg mb-4">Results</h3>
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-teal-50 border border-teal-200">
              <p className="text-sm text-slate-500">Required Portfolio Value</p>
              <p className="text-2xl font-bold text-teal-700">Rs {formatRs(result.requiredPortfolioValue)}</p>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Annual Dividend at Target</span>
              <span>Rs {formatRs(result.annualDividendAtTarget)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Estimated Years to Dividend Independence</span>
              <span>{result.estimatedYearsToDividendIndependence} years</span>
            </div>
          </div>
        </div>
      )}

      {result?.error && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 max-w-xl">{result.error}</div>
      )}

      {(aiLoading || aiAdvice) && (
        <div className="card p-4 sm:p-6 lg:p-8 max-w-3xl border-2 border-cyan-200/80">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="card-header text-lg flex items-center gap-2">
                <span aria-hidden>🤖</span>
                AI portfolio ideas (Groq)
              </h3>
              <p className="card-subtitle mt-1">
                How many stocks and how to split Rs {result ? formatRs(result.requiredPortfolioValue) : '—'} — based on
                DividendFlow&apos;s latest dividend calendar and news scrape.
              </p>
            </div>
            {result && !result.error && !aiLoading && (
              <button
                type="button"
                onClick={refreshAi}
                className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-teal-200 text-teal-700 hover:bg-teal-50"
              >
                Refresh AI
              </button>
            )}
          </div>

          {aiLoading && (
            <div className="flex items-center gap-3 py-8 text-slate-500">
              <div className="w-8 h-8 border-2 border-teal-300 border-t-teal-600 rounded-full animate-spin" />
              <span>Analyzing today&apos;s news and top dividend names…</span>
            </div>
          )}

          {aiAdvice && !aiLoading && !aiAdvice.ok && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-4">{aiAdvice.error}</p>
          )}

          {aiAdvice?.ok && (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-3">
                <span className="inline-flex items-center px-3 py-1 rounded-xl bg-emerald-100 text-emerald-800 text-sm font-semibold border border-emerald-200">
                  Suggested: {aiAdvice.suggestedNumberOfStocks} stocks
                </span>
                {shariahOnly && (
                  <span className="inline-flex items-center px-3 py-1 rounded-xl bg-slate-100 text-slate-700 text-xs font-medium">
                    Shariah list filter on
                  </span>
                )}
              </div>

              {aiAdvice.overview && (
                <p className="text-sm text-slate-700 leading-relaxed">{aiAdvice.overview}</p>
              )}
              {aiAdvice.todayMarketRead && (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Today&apos;s market read</p>
                  <p className="text-sm text-slate-700 leading-relaxed">{aiAdvice.todayMarketRead}</p>
                </div>
              )}

              {aiAdvice.holdings?.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600 text-left">
                        <th className="px-4 py-3 font-medium">Stock</th>
                        <th className="px-4 py-3 font-medium text-right">Weight</th>
                        <th className="px-4 py-3 font-medium text-right">Amount (Rs)</th>
                        <th className="px-4 py-3 font-medium">Rationale</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aiAdvice.holdings.map((h) => (
                        <tr key={h.symbol} className="border-t border-slate-100">
                          <td className="px-4 py-3 font-semibold text-slate-800">{h.symbol}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-teal-700 font-medium">
                            {h.weightPercent}%
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                            {formatRs(h.allocationRs)}
                          </td>
                          <td className="px-4 py-3 text-slate-600 text-xs leading-relaxed max-w-md">
                            {h.why}
                            {h.newsNote ? (
                              <span className="block mt-1 text-slate-500 italic">News: {h.newsNote}</span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {aiAdvice.cautions?.length > 0 && (
                <ul className="text-xs text-slate-600 space-y-1 list-disc pl-5">
                  {aiAdvice.cautions.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              )}

              <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3 leading-relaxed">
                {aiAdvice.disclaimer}
              </p>
            </div>
          )}
        </div>
      )}

      <Disclaimer />
    </div>
  );
}
