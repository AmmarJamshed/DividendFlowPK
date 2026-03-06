import { useState, useEffect } from 'react';
import { api } from '../api';
import Disclaimer from '../components/Disclaimer';

export default function WeakMonthOptimizer() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getMonthCoverage()
      .then(res => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-teal-500/30 border-t-teal-400 rounded-full animate-spin" />
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }
  if (!data) return <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">Failed to load data</div>;

  const { monthCoverage, weakMonths, dividends } = data;
  const allCompanies = [...new Set((dividends || []).map(d => d.Company || d.company))];

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h3 className="card-header text-lg">Monthly Dividend Coverage Matrix</h3>
        <p className="card-subtitle mb-6">Data-driven signal: months with fewer dividend payers may benefit from diversification</p>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {monthNames.map((m, i) => {
            const cov = monthCoverage?.[i + 1] || { count: 0, companies: [] };
            const isWeak = weakMonths?.some(w => w.month === i + 1);
            return (
              <div key={m} className={`p-4 rounded-xl transition-all ${isWeak ? 'bg-amber-500/10 border border-amber-500/40 shadow-glow' : 'bg-slate-700/30 border border-slate-600/50 hover:border-slate-500'}`}>
                <div className="font-semibold text-slate-200">{m}</div>
                <div className="text-teal-400 font-medium">{cov.count} companies</div>
                {isWeak && <span className="text-xs text-amber-400 font-medium mt-1 block">Weak month</span>}
              </div>
            );
          })}
        </div>
      </div>

      {weakMonths?.length > 0 && (
        <div className="card p-6">
          <h3 className="card-header text-lg">Weak Months Identified</h3>
          <p className="card-subtitle mb-6">Data-driven signal: Companies that historically pay in other months could help fill gaps. Not a buy recommendation.</p>
          <ul className="space-y-4">
            {weakMonths.map(w => (
              <li key={w.month} className="p-4 rounded-xl bg-slate-700/30 border border-slate-600/50">
                <strong className="text-teal-400">{w.monthName}</strong>: {w.count} dividend payers. Consider companies from: {allCompanies.slice(0, 5).join(', ')} (sample)
              </li>
            ))}
          </ul>
        </div>
      )}

      <Disclaimer />
    </div>
  );
}
