import { useState, useEffect } from 'react';
import { api } from '../api';
import Disclaimer from '../components/Disclaimer';

export default function ReportingCycles() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getReportingCycles()
      .then(res => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-teal-500/30 border-t-teal-400 rounded-full animate-spin" />
          <p className="text-slate-400">Loading reporting cycles...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card p-6 border-b-0 rounded-b-none">
        <h3 className="card-header text-lg">PSX Reporting Cycle Explorer</h3>
        <p className="card-subtitle">Fiscal year ends, quarter cycles, and estimated dividend payment timing</p>
      </div>
      <div className="card overflow-hidden rounded-t-none">
        <div className="table-responsive">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-800/80">
                <th className="text-left p-4 font-semibold text-slate-300">Company</th>
                <th className="text-left p-4 font-semibold text-slate-300">Sector</th>
                <th className="text-left p-4 font-semibold text-slate-300">Fiscal Year End</th>
                <th className="text-left p-4 font-semibold text-slate-300">Quarter End Months</th>
                <th className="text-left p-4 font-semibold text-slate-300">Dividend Announcement Period</th>
                <th className="text-left p-4 font-semibold text-slate-300">Book Closure Month</th>
                <th className="text-left p-4 font-semibold text-slate-300">Estimated Payment Month</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => (
                <tr key={i} className="border-t border-slate-700/50 hover:bg-slate-700/20 transition-colors">
                  <td className="p-4 font-medium text-slate-200">{d.Company || d.company}</td>
                  <td className="p-4 text-slate-400">{d.Sector || d.sector}</td>
                  <td className="p-4">{d.Fiscal_Year_End || d.fiscal_year_end}</td>
                  <td className="p-4">{d.Quarter_End_Months || d.quarter_end_months}</td>
                  <td className="p-4">{d.Dividend_Announcement_Period || d.dividend_announcement_period}</td>
                  <td className="p-4">{d.Book_Closure_Month || d.book_closure_month}</td>
                  <td className="p-4"><span className="px-2 py-1 rounded-lg bg-teal-500/20 text-teal-400 font-medium">{d.Estimated_Payment_Month || d.estimated_payment_month}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Disclaimer />
    </div>
  );
}
