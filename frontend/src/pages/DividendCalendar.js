import { useState, useEffect } from 'react';
import { api } from '../api';
import Disclaimer from '../components/Disclaimer';

export default function DividendCalendar() {
  const [dividends, setDividends] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getDividends()
      .then(res => setDividends(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const monthNames = { 1:'Jan',2:'Feb',3:'Mar',4:'Apr',5:'May',6:'Jun',7:'Jul',8:'Aug',9:'Sep',10:'Oct',11:'Nov',12:'Dec' };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-teal-500/30 border-t-teal-400 rounded-full animate-spin" />
          <p className="text-slate-400">Loading dividend calendar...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card overflow-hidden">
        <div className="p-6 border-b border-slate-700/50 bg-gradient-to-r from-slate-800/50 to-transparent">
          <h3 className="card-header text-lg">Dividend Calendar by Payment Month</h3>
          <p className="card-subtitle">PSX companies and their dividend payment schedules. Each row is a separate dividend payment (interim or final); the same company appears multiple times for different payment periods.</p>
        </div>
        <div className="table-responsive">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-800/80">
                <th className="text-left p-4 font-semibold text-slate-300">Company</th>
                <th className="text-left p-4 font-semibold text-slate-300">Sector</th>
                <th className="text-left p-4 font-semibold text-slate-300">Dividend/Share</th>
                <th className="text-left p-4 font-semibold text-slate-300">Interim/Final</th>
                <th className="text-left p-4 font-semibold text-slate-300">Payment Period</th>
                <th className="text-left p-4 font-semibold text-slate-300">Yield %</th>
              </tr>
            </thead>
            <tbody>
              {dividends.map((d, i) => {
                const pm = d.Payment_month || d.payment_month;
                const yr = d.Year || d.year;
                const period = `${monthNames[pm] || pm} ${yr}`;
                const type = d.Type || d.dividendType || 'Interim';
                const isFinal = type === 'Final';
                return (
                  <tr key={i} className="border-t border-slate-700/50 hover:bg-slate-700/20 transition-colors">
                    <td className="p-4 font-medium text-slate-200">{d.Company || d.company}</td>
                    <td className="p-4 text-slate-400">{d.Sector || d.sector}</td>
                    <td className="p-4">{d.Dividend_per_share || d.dividend_per_share}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-lg font-medium text-xs ${isFinal ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-600/40 text-slate-300'}`} title={isFinal ? 'Final dividend (announced with annual results)' : 'Interim dividend (paid during the year)'}>
                        {type}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="px-2 py-1 rounded-lg bg-slate-600/40 text-slate-300 font-medium">
                        {period}
                      </span>
                    </td>
                    <td className="p-4"><span className="px-2 py-1 rounded-lg bg-teal-500/20 text-teal-400 font-medium">{(d.Dividend_yield || d.dividend_yield) || '-'}%</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <Disclaimer />
    </div>
  );
}
