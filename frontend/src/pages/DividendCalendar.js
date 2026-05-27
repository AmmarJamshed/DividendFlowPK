import { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import Disclaimer from '../components/Disclaimer';
import DividendCalculator from '../components/DividendCalculator';
import PageHero from '../components/ui/PageHero';
import { ThWithTip } from '../components/ui/HelpTip';

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

  const paymentMonthNum = (d) => {
    const raw = d.Payment_month ?? d.payment_month;
    const n = parseInt(raw, 10);
    if (n >= 1 && n <= 12) return n;
    const iso = String(raw || '').match(/^(\d{4})-(\d{2})/);
    if (iso) {
      const m = parseInt(iso[2], 10);
      return m >= 1 && m <= 12 ? m : null;
    }
    return null;
  };

  const dividendsForSelected = useMemo(() => {
    if (!selectedMonth || !dividends?.length) return [];
    return dividends.filter((d) => paymentMonthNum(d) === selectedMonth);
  }, [dividends, selectedMonth]);

  const selectedWeak = selectedMonth ? weakByMonth.get(selectedMonth) : null;
  const selectedCov = selectedMonth ? monthCoverage?.[selectedMonth] : null;
  const isWeak = Boolean(selectedWeak);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-teal-200 border-t-teal-500 rounded-full animate-spin" />
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
        description="See which months pay the most dividends, estimate cash from your holdings, and read amounts aligned with PSX company notices. New to investing? Start with the glossary below — we explain every column in plain language."
      />

      <details className="card p-4 sm:p-5 border-teal-200/80 bg-teal-50/40">
        <summary className="cursor-pointer font-semibold text-teal-800 text-sm">
          New here? Quick glossary (tap to expand)
        </summary>
        <ul className="mt-3 space-y-2 text-sm text-slate-600 list-disc pl-5">
          <li>
            <strong>Dividend per share (Rs)</strong> — cash the company plans to pay for each share you own for that
            announcement. We derive this from the official PSX notice text (e.g. 85% of face value), not from
            third-party yield sites.
          </li>
          <li>
            <strong>Yield %</strong> — dividend per share divided by the latest saved share price in our dataset
            (informational only).
          </li>
          <li>
            <strong>Payment month</strong> — when cash is expected to reach shareholders (about one month after book
            closure on PSX).
          </li>
          <li>
            <strong>Interim vs Final</strong> — interim is paid during the year; final is usually with annual results.
          </li>
          <li>
            Always confirm on{' '}
            <a href="https://dps.psx.com.pk/payouts" className="text-teal-700 underline" target="_blank" rel="noopener noreferrer">
              dps.psx.com.pk/payouts
            </a>{' '}
            and your broker before acting.
          </li>
        </ul>
      </details>

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
              count >= 20 ? 'bg-emerald-500' : count >= 10 ? 'bg-teal-500' : count >= 5 ? 'bg-violet-500' : 'bg-sky-400';
            const selected = selectedMonth === monthNum;
            return (
              <button
                type="button"
                key={m}
                onClick={() => setSelectedMonth(monthNum)}
                className={`p-4 rounded-2xl text-left transition-all duration-200 hover:scale-[1.03] hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 ${
                  weak
                    ? 'bg-gradient-to-br from-orange-400 to-amber-500 text-white shadow-lg shadow-orange-300/50'
                    : `${strongColor} text-white shadow-lg`
                } ${selected ? 'ring-4 ring-teal-300 ring-offset-2 scale-[1.02]' : ''}`}
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
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left p-4">Company</th>
                    <th className="text-left p-4">Sector</th>
                    <ThWithTip className="text-left p-4 min-w-[10rem]" tip="Exact wording from the company’s PSX dividend notice on dps.psx.com.pk (e.g. 85%(i))">
                      PSX announcement
                    </ThWithTip>
                    <ThWithTip className="text-left p-4" tip="Rupees per share we calculate from the PSX notice (% of face value). Confirm before investing.">
                      Dividend/Share (Rs)
                    </ThWithTip>
                    <ThWithTip className="text-left p-4" tip="Interim = paid during the year. Final = usually with annual results.">
                      Interim/Final
                    </ThWithTip>
                    <ThWithTip className="text-left p-4" tip="Month and year when cash is expected in your account (from PSX payment schedule).">
                      Payment period
                    </ThWithTip>
                    <ThWithTip className="text-left p-4" tip="Dividend per share ÷ latest saved price in our dataset — not a buy recommendation.">
                      Yield %
                    </ThWithTip>
                  </tr>
                </thead>
                <tbody>
                  {dividendsForSelected.map((d, idx) => {
                    const pm = paymentMonthNum(d);
                    const yr = d.Year || d.year;
                    const period = pm ? `${MONTH_SHORT[pm - 1]} ${yr}` : `${d.Payment_month || '—'} ${yr}`;
                    const type = d.Type || d.dividendType || 'Interim';
                    const isFinal = type === 'Final';
                    const ann = (d.Dividend_announcement || d.dividend_announcement || '').trim();
                    return (
                      <tr key={`${d.Company || d.company}-${idx}`} className="border-t border-slate-100 hover:bg-teal-50/50 transition-colors">
                        <td className="p-4 font-medium text-slate-700">{d.Company || d.company}</td>
                        <td className="p-4 text-slate-500">{d.Sector || d.sector}</td>
                        <td className="p-4 text-slate-600 text-sm max-w-[14rem]">
                          {ann ? (
                            <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded-md break-words" title={ann}>
                              {ann}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="p-4">
                          <span className="font-medium text-slate-800">
                            {d.Dividend_per_share || d.dividend_per_share || '—'}
                          </span>
                          {d.dps_source === 'psx_announcement' && (
                            <span className="block text-[10px] text-emerald-700 font-medium mt-0.5">
                              From PSX notice
                              {d.dps_par_value ? ` (face Rs ${d.dps_par_value})` : ''}
                            </span>
                          )}
                          {d.calendar_dps_mismatch && (
                            <span className="block text-[10px] text-amber-700 mt-0.5">
                              Corrected vs old calendar file
                            </span>
                          )}
                        </td>
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
