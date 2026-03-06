import { useState } from 'react';
import { api } from '../api';
import Disclaimer from '../components/Disclaimer';

export default function SalarySimulator() {
  const [targetIncome, setTargetIncome] = useState(100000);
  const [yieldPct, setYieldPct] = useState(6);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const calculate = () => {
    setLoading(true);
    setResult(null);
    api.getSalarySimulator(targetIncome, yieldPct)
      .then(res => setResult(res.data))
      .catch(err => setResult({ error: err.message }))
      .finally(() => setLoading(false));
  };

  return (
    <div className="space-y-8">
      <div className="card p-8 max-w-xl">
        <h3 className="card-header text-lg">Salary Replacement Simulator</h3>
        <p className="card-subtitle mb-6">Estimate the portfolio value needed to replace your salary with dividend income</p>
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Target Monthly Income (Rs)</label>
            <input
              type="number"
              value={targetIncome}
              onChange={e => setTargetIncome(Number(e.target.value))}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Expected Dividend Yield (%)</label>
            <input
              type="number"
              value={yieldPct}
              onChange={e => setYieldPct(Number(e.target.value))}
              step="0.5"
              className="input-field"
            />
          </div>
          <button onClick={calculate} disabled={loading} className="btn-primary w-full py-3">
            {loading ? 'Calculating...' : 'Calculate'}
          </button>
        </div>
      </div>

      {result && !result.error && (
        <div className="card p-8 max-w-xl border-teal-500/30">
          <h3 className="card-header text-lg mb-4">Results</h3>
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-teal-500/10 border border-teal-500/30">
              <p className="text-sm text-slate-400">Required Portfolio Value</p>
              <p className="text-2xl font-bold text-teal-400">Rs {result.requiredPortfolioValue?.toLocaleString()}</p>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Annual Dividend at Target</span>
              <span>Rs {result.annualDividendAtTarget?.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Estimated Years to Dividend Independence</span>
              <span>{result.estimatedYearsToDividendIndependence} years</span>
            </div>
          </div>
        </div>
      )}

      {result?.error && <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">{result.error}</div>}

      <Disclaimer />
    </div>
  );
}
