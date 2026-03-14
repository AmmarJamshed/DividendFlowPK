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
          <div className="w-12 h-12 border-4 border-teal-200 border-t-teal-500 rounded-full animate-spin" />
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }
  if (!data) return <div className="p-4 rounded-2xl bg-orange-100 border border-orange-300 text-orange-700 font-medium">Failed to load data</div>;

  const { monthCoverage, weakMonths, dividends } = data;
  const allCompanies = [...new Set((dividends || []).map(d => d.Company || d.company))];

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h3 className="card-header text-lg">Monthly Dividend Coverage Matrix</h3>
        <p className="card-subtitle mb-6">Data-driven signal: months with fewer dividend payers may benefit from diversification.</p>
        <p className="text-xs text-slate-500 mb-4 -mt-2">Source: Payment months from <strong>dps.psx.com.pk/payouts</strong> (current) when available, else psxterminal.com. Prices from dps.psx.com.pk (psx.py). Verify at <a href="https://dps.psx.com.pk/payouts" target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">dps.psx.com.pk/payouts</a>.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {monthNames.map((m, i) => {
            const cov = monthCoverage?.[i + 1] || { count: 0, companies: [] };
            const isWeak = weakMonths?.some(w => w.month === i + 1);
            const count = cov.count || 0;
            const strongColor = count >= 20 ? 'bg-emerald-500' : count >= 10 ? 'bg-teal-500' : count >= 5 ? 'bg-violet-500' : 'bg-sky-500';
            return (
              <div
                key={m}
                className={`p-4 rounded-2xl transition-all duration-300 hover:scale-[1.03] hover:shadow-lg ${
                  isWeak
                    ? 'bg-gradient-to-br from-orange-400 to-amber-500 text-white shadow-lg shadow-orange-300/50'
                    : `${strongColor} text-white shadow-lg`
                }`}
              >
                <div className="font-bold text-lg">{m}</div>
                <div className="font-semibold opacity-95">{cov.count} companies</div>
                {isWeak && <span className="text-xs font-bold mt-1 block opacity-90">Weak month</span>}
              </div>
            );
          })}
        </div>
      </div>

      {weakMonths?.length > 0 && (
        <div className="card p-6">
          <h3 className="card-header text-lg">Weak Months Identified</h3>
          <p className="card-subtitle mb-6">Data-driven signal: Companies that historically pay in other months could help fill gaps. Not a buy recommendation.</p>
          <p className="text-xs text-slate-500 mb-4 -mt-2">Weak = fewer than half the average payers per month.</p>
          <ul className="space-y-4">
            {weakMonths.map((w, idx) => (
              <li
                key={w.month}
                className={`p-5 rounded-2xl text-white font-medium shadow-lg transition-all duration-300 hover:scale-[1.01] hover:shadow-xl ${
                  idx % 3 === 0 ? 'bg-gradient-to-r from-orange-400 to-amber-500 shadow-orange-300/40' :
                  idx % 3 === 1 ? 'bg-gradient-to-r from-violet-500 to-purple-600 shadow-violet-300/40' :
                  'bg-gradient-to-r from-emerald-500 to-teal-600 shadow-emerald-300/40'
                }`}
              >
                <strong className="font-bold">{w.monthName}</strong>: {w.count} dividend payers. Consider: {((w.suggestCompanies || w.companies || []).slice(0, 8).join(', ')) || allCompanies.slice(0, 5).join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Disclaimer />
    </div>
  );
}
