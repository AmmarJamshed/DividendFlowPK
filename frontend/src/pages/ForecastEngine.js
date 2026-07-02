import { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import Disclaimer from '../components/Disclaimer';
import PageHero from '../components/ui/PageHero';

const today = () => new Date().toISOString().slice(0, 10);
const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

function formatRs(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPct(n, digits = 2) {
  if (n == null || Number.isNaN(n)) return '—';
  return `${Number(n).toFixed(digits)}%`;
}

function PriceRangeBand({ low, base, high }) {
  const lo = Number(low);
  const hi = Number(high);
  const mid = Number(base);
  if (!lo || !hi || hi <= lo) return null;

  const span = hi - lo;
  const basePct = Math.min(100, Math.max(0, ((mid - lo) / span) * 100));
  const bandWidthPct = span > 0 ? ((hi - lo) / mid) * 100 : 0;

  return (
    <div className="mt-6">
      <div className="flex justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
        <span>Low {formatRs(lo)}</span>
        <span>Base {formatRs(mid)}</span>
        <span>High {formatRs(hi)}</span>
      </div>
      <div className="relative h-3 rounded-sm bg-slate-200 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-slate-400/35"
          style={{ width: `${basePct}%` }}
        />
        <div
          className="absolute inset-y-0 w-0.5 bg-slate-800 -translate-x-1/2"
          style={{ left: `${basePct}%` }}
          title={`Last close: ${formatRs(mid)}`}
        />
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Band width ≈ {formatPct(bandWidthPct, 1)} of last close (historical volatility model).
      </p>
    </div>
  );
}

function StatCell({ label, value, sub }) {
  return (
    <div className="px-4 py-3 border-r border-slate-200 last:border-r-0 min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-slate-900 tabular-nums mt-0.5">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function ScenarioTable({ capitalGain }) {
  if (!capitalGain) return null;
  const rows = [
    { key: 'conservative', label: 'Conservative', data: capitalGain.conservative },
    { key: 'base', label: 'Base', data: capitalGain.base },
    { key: 'optimistic', label: 'Optimistic', data: capitalGain.optimistic },
  ];

  return (
    <div className="overflow-x-auto border border-slate-200 rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600 border-b border-slate-200">
            <th className="px-4 py-3">Scenario</th>
            <th className="px-4 py-3 text-right">Indicated dividend yield</th>
            <th className="px-4 py-3 text-right">Assumed price appreciation</th>
            <th className="px-4 py-3 text-right">Blended return</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, label, data }) => (
            <tr key={key} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/80">
              <td className="px-4 py-3 font-medium text-slate-800">{label}</td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                {formatPct(data?.dividend)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                {formatPct(data?.appreciation, 0)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900">
                {formatPct(data?.blended)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 py-2 text-[11px] text-slate-500 bg-slate-50 border-t border-slate-200">
        Appreciation assumptions are fixed illustrative rates (2% / 8% / 15%), not modelled from price history.
        Dividend yield from PSX calendar data for the selected symbol.
      </p>
    </div>
  );
}

export default function ForecastEngine() {
  const [companies, setCompanies] = useState(['HBL', 'MCB', 'OGDC', 'PPL', 'PSO']);
  const [company, setCompany] = useState('HBL');
  const [asOfDate, setAsOfDate] = useState(today());
  const [forecast, setForecast] = useState(null);
  const [capitalGain, setCapitalGain] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .getDividends()
      .then((res) => {
        const names = [...new Set((res.data || []).map((d) => d.Company || d.company).filter(Boolean))].sort();
        if (names.length) {
          setCompanies(names);
          setCompany((c) => (names.includes(c) ? c : names[0]));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([api.getForecast(company, asOfDate || undefined), api.getCapitalGain(company)])
      .then(([fRes, cRes]) => {
        setForecast(fRes.data);
        setCapitalGain(cRes.data);
      })
      .catch((err) => {
        setError(err?.message || 'Unable to load forecast data.');
        setForecast(null);
        setCapitalGain(null);
      })
      .finally(() => setLoading(false));
  }, [company, asOfDate]);

  const bandPct = useMemo(() => {
    if (!forecast?.lastPrice || !forecast?.lowCase) return null;
    const width = forecast.highCase - forecast.lowCase;
    return forecast.lastPrice > 0 ? (width / forecast.lastPrice) * 100 : null;
  }, [forecast]);

  const dateOptions = useMemo(() => {
    const opts = [
      { value: today(), label: 'Today' },
      { value: yesterday(), label: 'Yesterday' },
    ];
    for (let i = 0; i < 5; i += 1) {
      const d = new Date();
      d.setDate(d.getDate() - (i + 2));
      const v = d.toISOString().slice(0, 10);
      opts.push({
        value: v,
        label: d.toLocaleDateString('en-PK', { weekday: 'short', day: 'numeric', month: 'short' }),
      });
    }
    return opts;
  }, []);

  return (
    <div className="df-page max-w-5xl">
      <PageHero
        eyebrow="PSX · Quantitative view"
        title="Price range & return scenarios"
        description="Statistical band around the latest closing price, plus a simple dividend + appreciation worksheet. Updated from saved market files after each session close (≈ 3:30 pm PKT)."
      />

      <section className="df-card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-end gap-4">
          <label className="block min-w-[140px]">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Symbol</span>
            <select
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-sm font-medium text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400/40 focus:border-slate-400"
            >
              {companies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-[160px]">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">As of date</span>
            <select
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-sm font-medium text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400/40 focus:border-slate-400"
            >
              {dateOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
          </div>
        )}

        {error && !loading && (
          <p className="px-4 py-8 text-sm text-red-700 bg-red-50">{error}</p>
        )}

        {!loading && !error && forecast && (
          <>
            {forecast.message && (
              <p className="px-4 py-3 text-sm text-amber-900 bg-amber-50 border-b border-amber-100">{forecast.message}</p>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 border-b border-slate-200">
              <StatCell label="Last close (PKR)" value={formatRs(forecast.lastPrice)} sub={forecast.asOfDate ? `Date ${forecast.asOfDate}` : null} />
              <StatCell label="Volatility (σ proxy)" value={formatPct(forecast.volatility)} sub="From recent closes" />
              <StatCell label="Band low" value={formatRs(forecast.lowCase)} sub="−1σ band" />
              <StatCell label="Band high" value={formatRs(forecast.highCase)} sub=" +1σ band" />
            </div>

            <div className="px-4 py-5">
              <h2 className="text-sm font-semibold text-slate-900">Implied price range</h2>
              <p className="text-xs text-slate-500 mt-1">
                Low and high cases scale the last close by historical price dispersion (not a directional forecast).
              </p>

              <div className="mt-4 grid grid-cols-3 gap-px bg-slate-200 border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-white px-4 py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Low case</p>
                  <p className="text-xl font-semibold text-slate-900 tabular-nums mt-1">{formatRs(forecast.lowCase)}</p>
                  {forecast.lastPrice > 0 && (
                    <p className="text-xs text-slate-500 mt-1 tabular-nums">
                      {formatPct(((forecast.lowCase - forecast.lastPrice) / forecast.lastPrice) * 100)} vs close
                    </p>
                  )}
                </div>
                <div className="bg-slate-50 px-4 py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Base (last close)</p>
                  <p className="text-xl font-semibold text-slate-900 tabular-nums mt-1">{formatRs(forecast.baseCase)}</p>
                </div>
                <div className="bg-white px-4 py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">High case</p>
                  <p className="text-xl font-semibold text-slate-900 tabular-nums mt-1">{formatRs(forecast.highCase)}</p>
                  {forecast.lastPrice > 0 && (
                    <p className="text-xs text-slate-500 mt-1 tabular-nums">
                      {formatPct(((forecast.highCase - forecast.lastPrice) / forecast.lastPrice) * 100)} vs close
                    </p>
                  )}
                </div>
              </div>

              <PriceRangeBand low={forecast.lowCase} base={forecast.baseCase} high={forecast.highCase} />

              {bandPct != null && (
                <p className="mt-3 text-xs text-slate-500 tabular-nums">
                  Total range: {formatRs(forecast.highCase - forecast.lowCase)} ({formatPct(bandPct, 1)} of last close).
                </p>
              )}
            </div>
          </>
        )}
      </section>

      {!loading && capitalGain && (
        <section className="df-card overflow-hidden">
          <div className="px-4 py-4 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">Blended return worksheet</h2>
            <p className="text-xs text-slate-500 mt-1">
              Dividend yield plus assumed capital appreciation — for comparison only, not a forward estimate.
            </p>
          </div>
          <div className="p-4">
            <ScenarioTable capitalGain={capitalGain} />
          </div>
        </section>
      )}

      <Disclaimer />
    </div>
  );
}
