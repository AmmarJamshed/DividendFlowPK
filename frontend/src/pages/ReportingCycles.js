import { useState, useEffect } from 'react';
import { api } from '../api';
import Disclaimer from '../components/Disclaimer';
import PageHero from '../components/ui/PageHero';

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
          <div className="w-12 h-12 border-4 border-ice-200 border-t-ice-500 rounded-full animate-spin" />
          <p className="text-slate-500">Loading reporting cycles...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="df-page">
      <PageHero
        eyebrow="PSX · Reporting"
        title="Reporting cycle explorer"
        description="Fiscal year ends, quarter cycles, and estimated dividend payment timing for listed companies."
      />
      <div className="df-card overflow-hidden">
        <div className="table-responsive">
          <table className="w-full">
            <thead>
              <tr className="df-table-head">
                <th className="text-left p-4 font-semibold text-slate-600">Company</th>
                <th className="text-left p-4 font-semibold text-slate-600">Sector</th>
                <th className="text-left p-4 font-semibold text-slate-600">Fiscal Year End</th>
                <th className="text-left p-4 font-semibold text-slate-600">Quarter End Months</th>
                <th className="text-left p-4 font-semibold text-slate-600">Dividend Announcement Period</th>
                <th className="text-left p-4 font-semibold text-slate-600">Book Closure Month</th>
                <th className="text-left p-4 font-semibold text-slate-600">Estimated Payment Month</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => (
                <tr key={i} className="df-table-row">
                  <td className="p-4 font-medium text-slate-700">{d.Company || d.company}</td>
                  <td className="p-4 text-slate-500">{d.Sector || d.sector}</td>
                  <td className="p-4">{d.Fiscal_Year_End || d.fiscal_year_end}</td>
                  <td className="p-4">{d.Quarter_End_Months || d.quarter_end_months}</td>
                  <td className="p-4">{d.Dividend_Announcement_Period || d.dividend_announcement_period}</td>
                  <td className="p-4">{d.Book_Closure_Month || d.book_closure_month}</td>
                  <td className="p-4"><span className="px-2 py-1 rounded-lg bg-blue-50 text-[#1E3A8A] font-medium">{d.Estimated_Payment_Month || d.estimated_payment_month}</span></td>
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
