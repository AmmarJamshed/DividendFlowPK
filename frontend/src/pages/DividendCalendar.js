import { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import Disclaimer from '../components/Disclaimer';
import DividendCalculator from '../components/DividendCalculator';
import PageHero from '../components/ui/PageHero';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function DividendCalendar() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(null);

  useEffect(() => {
    api
      .getMonthCoverage()
      .then((res) => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const { monthCoverage, weakMonths, dividends } = data || {
    monthCoverage: {},
    weakMonths: [],
    dividends: [],
  };

  const avgPayoutsPerMonth = useMemo(() => {
    if (!dividends?.length) return 0;
    return dividends.length / 12;
  }, [dividends]);

  const weakByMonth = useMemo(() => {
    const m = new Map();
    (weakMonths || []).forEach((w) => m.set(w.month, w));
    return m;
  }, [weakMonths]);

  const symbolList = useMemo(() => {
    if (!dividends?.length) return [];
    return [...new Set(dividends.map((d) => (d.Company || d.company || '').trim()).filter(Boolean))];
  }, [dividends]);

  const dividendsForSelected = useMemo(() => {
    if (!selectedMonth || !dividends?.length) return [];
    return dividends.filter((d) => {
      const pm = parseInt(d.Payment_month || d.payment_month || 0, 10);
      return pm === selectedMonth;
    });
  }, [dividends, selectedMonth]);

  const selectedWeak = selectedMonth ? weakByMonth.get(selectedMonth) : null;
  const selectedCov = selectedMonth ? monthCoverage?.[selectedMonth] : null;
  const isWeak = Boolean(selectedWeak);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-slate-200 border-t-[#1f4d7a] rounded-full animate-spin" />
          <p className="text-slate-500">Loading dividend calendar...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 rounded-2xl bg-orange-100 border border-orange-300 text-orange-700 font-medium">
        Failed to load calendar data.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        variant="light"
        eyebrow="Income planning"
        title="Dividend calendar & calculator"
        description="Model expected dividend cash by payment month and review company payout schedules. Figures are derived from public PSX datasets — confirm dates and amounts with official announcements."
      />
      <DividendCalculator symbolList={symbolList} />

      <div className="card p-6">
        <h3 className="card-header text-lg">Dividend calendar &amp; monthly coverage</h3>
        <p className="card-subtitle mb-2">
          Click a month to see every scheduled payout in that payment month, whether it&apos;s a <strong>weak</strong> month for
          diversification, and ideas to balance income across the year.
        </p>
        <p className="text-xs text-slate-500 mb-4">
          <strong>Weak month</strong> = fewer than half the average number of payout rows per month across the dataset. Not a buy
          recommendation. Source: payment months from public PSX dividend data; verify at{' '}
          <a
            href="https://dps.psx.com.pk/payouts"
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal-600 hover:underline"
          >
            dps.psx.com.pk/payouts
          </a>
          .
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {MONTH_SHORT.map((m, i) => {
            const monthNum = i + 1;
            const cov = monthCoverage?.[monthNum] || { count: 0, companies: [] };
            const count = cov.count || 0;
            const weak = weakByMonth.has(monthNum);
            const strongColor =
              count >= 20 ? 'bg-[#11836a]' : count >= 10 ? 'bg-[#1f4d7a]' : count >= 5 ? 'bg-[#3d6f9b]' : 'bg-slate-400';
            const selected = selectedMonth === monthNum;
            return (
              <button
                type="button"
                key={m}
                onClick={() => setSelectedMonth(monthNum)}
                className={`p-4 rounded-xl text-left transition-all duration-200 hover:scale-[1.02] hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c5a667] focus-visible:ring-offset-2 ${
                  weak
                    ? 'bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-md'
                    : `${strongColor} text-white shadow-md`
                } ${selected ? 'ring-2 ring-[#c5a667] ring-offset-2 scale-[1.02]' : ''}`}
              >
                <div className="font-bold text-lg">{m}</div>
                <div className="font-semibold opacity-95">{count} payout{count !== 1 ? 's' : ''}</div>
                {weak && <span className="text-xs font-bold mt-1 block opacity-90">Weak month</span>}
                {!weak && count > 0 && <span className="text-xs font-semibold mt-1 block opacity-90">Stronger coverage</span>}
              </button>
            );
          })}
        </div>
      </div>

      {selectedMonth && (
        <div className="card overflow-hidden">
          <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-teal-50/50 to-transparent">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <h3 className="card-header text-lg">{MONTH_LONG[selectedMonth - 1]} — payouts &amp; analysis</h3>
                <p className="card-subtitle mt-1">
                  {selectedCov?.count ?? 0} dividend payment row{selectedCov?.count !== 1 ? 's' : ''} in this payment month
                  (same company may appear more than once for interim vs final).
                </p>
              </div>
              <div
                className={`shrink-0 px-4 py-2 rounded-xl text-sm font-bold ${
                  isWeak
                    ? 'bg-orange-100 text-orange-800 border border-orange-200'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                }`}
              >
                {isWeak ? 'Weak month (vs portfolio average)' : 'Not classified as weak'}
              </div>
            </div>
            <p className="text-sm text-slate-600 mt-3">
              Average payout rows per month (whole year): ~{avgPayoutsPerMonth.toFixed(1)}. Weak months fall below half of that
              (~{(avgPayoutsPerMonth * 0.5).toFixed(1)}).
            </p>
            {isWeak && selectedWeak && (
              <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-950">
                <p className="font-semibold text-amber-900 mb-1">Ideas to spread income (historical payers in busier months)</p>
                <p className="text-amber-900/90">
                  {[...new Set(selectedWeak.suggestCompanies || selectedWeak.companies || [])].slice(0, 12).join(', ') ||
                    '—'}
                </p>
                <p className="text-xs text-amber-800/80 mt-2">For research only; not a recommendation to buy or sell.</p>
              </div>
            )}
          </div>

          <div className="p-6 border-b border-slate-100 bg-slate-50/80">
            <p className="text-sm text-slate-600 space-y-1">
              <span className="block">
                <span className="font-semibold text-amber-600">Final</span> — Typically with annual results after fiscal year-end.
              </span>
              <span className="block">
                <span className="font-semibold text-slate-600">Interim</span> — Paid during the year (e.g. after a quarter).
              </span>
            </p>
          </div>

          {dividendsForSelected.length === 0 ? (
            <div className="p-8 text-center text-slate-500">No dividend rows for this payment month in the current dataset.</div>
          ) : (
            <div className="table-responsive">
              {(() => {
                const hasPsxAnnouncement = dividendsForSelected.some(
                  (d) => (d.Dividend_announcement || d.dividend_announcement || '').trim()
                );
                return (
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left p-4 font-semibold text-slate-600">Company</th>
                    <th className="text-left p-4 font-semibold text-slate-600">Sector</th>
                    {hasPsxAnnouncement && (
                      <th className="text-left p-4 font-semibold text-slate-600 min-w-[140px]">PSX announcement</th>
                    )}
                    <th className="text-left p-4 font-semibold text-slate-600">Dividend/Share</th>
                    <th className="text-left p-4 font-semibold text-slate-600">Interim/Final</th>
                    <th className="text-left p-4 font-semibold text-slate-600">Payment period</th>
                    <th className="text-left p-4 font-semibold text-slate-600">Yield %</th>
                  </tr>
                </thead>
                <tbody>
                  {dividendsForSelected.map((d, idx) => {
                    const pm = d.Payment_month || d.payment_month;
                    const yr = d.Year || d.year;
                    const period = `${MONTH_SHORT[pm - 1] || pm} ${yr}`;
                    const type = d.Type || d.dividendType || 'Interim';
                    const isFinal = type === 'Final';
                    const ann = (d.Dividend_announcement || d.dividend_announcement || '').trim();
                    return (
                      <tr key={`${d.Company || d.company}-${idx}`} className="border-t border-slate-100 hover:bg-teal-50/50 transition-colors">
                        <td className="p-4 font-medium text-slate-700">{d.Company || d.company}</td>
                        <td className="p-4 text-slate-500">{d.Sector || d.sector}</td>
                        {hasPsxAnnouncement && (
                          <td className="p-4 text-slate-600 text-sm max-w-xs">{ann || '—'}</td>
                        )}
                        <td className="p-4">{d.Dividend_per_share || d.dividend_per_share || '—'}</td>
                        <td className="p-4">
                          <span
                            className={`px-2 py-1 rounded-lg font-medium text-xs ${
                              isFinal ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                            }`}
                            title={
                              isFinal
                                ? 'Final dividend (announced with annual results)'
                                : 'Interim dividend (paid during the year)'
                            }
                          >
                            {type}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-600 font-medium">{period}</span>
                        </td>
                        <td className="p-4">
                          <span className="px-2 py-1 rounded-lg bg-teal-100 text-teal-700 font-medium">
                            {(d.Dividend_yield || d.dividend_yield) || '-'}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {!selectedMonth && (
        <div className="card p-6 bg-slate-50/80 border border-dashed border-slate-200">
          <p className="text-slate-600 text-center">
            Select a month above to see payouts, weak/strong label, and suggestions for thin months.
          </p>
        </div>
      )}

      <Disclaimer />
    </div>
  );
}
