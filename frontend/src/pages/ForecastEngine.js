import { useState, useEffect } from 'react';
import { api } from '../api';
import Disclaimer from '../components/Disclaimer';

const today = () => new Date().toISOString().slice(0, 10);
const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

export default function ForecastEngine() {
  const [companies, setCompanies] = useState(['HBL', 'MCB', 'OGDC', 'PPL', 'PSO']);
  const [company, setCompany] = useState('HBL');
  const [asOfDate, setAsOfDate] = useState(today());

  useEffect(() => {
    api.getDividends()
      .then(res => {
        const names = [...new Set((res.data || []).map(d => d.Company || d.company).filter(Boolean))].sort();
        if (names.length) {
          setCompanies(names);
          setCompany(c => (names.includes(c) ? c : names[0]));
        }
      })
      .catch(() => {});
  }, []);
  const [forecast, setForecast] = useState(null);
  const [capitalGain, setCapitalGain] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getForecast(company, asOfDate || undefined),
      api.getCapitalGain(company)
    ])
      .then(([fRes, cRes]) => {
        setForecast(fRes.data);
        setCapitalGain(cRes.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [company, asOfDate]);

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h3 className="card-header text-lg">Probability-Based Price Range</h3>
        <p className="card-subtitle mb-4">Uses latest closing price. Updated daily after market close (3:30pm PKT).</p>
        <div className="flex flex-wrap gap-4 items-center">
          <select
            value={company}
            onChange={e => setCompany(e.target.value)}
            className="input-field max-w-[180px]"
          >
            {companies.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-sm">Forecast as of:</span>
            <select
              value={asOfDate}
              onChange={e => setAsOfDate(e.target.value)}
              className="input-field max-w-[160px]"
            >
              <option value={today()}>Today</option>
              <option value={yesterday()}>Yesterday</option>
              {[...Array(5)].map((_, i) => {
                const d = new Date();
                d.setDate(d.getDate() - (i + 2));
                const v = d.toISOString().slice(0, 10);
                return <option key={v} value={v}>{d.toLocaleDateString('en-PK', { weekday: 'short', month: 'short', day: 'numeric' })}</option>;
              })}
            </select>
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-12 h-12 border-4 border-teal-500/30 border-t-teal-400 rounded-full animate-spin" />
        </div>
      )}

      {!loading && forecast && (
        <>
          {(forecast.asOfDate || forecast.lastPrice) && (
            <div className="card p-4 bg-amber-50 border border-amber-200">
              <p className="text-slate-700 text-sm">
                <span className="text-slate-600 font-medium">Last closing price:</span> Rs {forecast.lastPrice?.toLocaleString()}
                <span className="text-slate-500 ml-2">• As of {forecast.asOfDate || 'latest'}</span>
              </p>
              {forecast.message && (
                <p className="text-amber-400/80 text-xs mt-1">{forecast.message}</p>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="card p-6 bg-rose-50/90 border border-rose-200">
              <h4 className="text-slate-600 text-sm font-medium mb-2">Low Case</h4>
              <p className="text-2xl font-bold text-red-600">Rs {forecast.lowCase?.toLocaleString()}</p>
            </div>
            <div className="card p-6 border-teal-500/40 shadow-glow bg-teal-50/50">
              <h4 className="text-slate-600 text-sm font-medium mb-2">Base Case</h4>
              <p className="text-2xl font-bold text-teal-600">Rs {forecast.baseCase?.toLocaleString()}</p>
            </div>
            <div className="card p-6 bg-emerald-50/90 border border-emerald-200">
              <h4 className="text-slate-600 text-sm font-medium mb-2">High Case</h4>
              <p className="text-2xl font-bold text-emerald-600">Rs {forecast.highCase?.toLocaleString()}</p>
            </div>
          </div>

          <div className="card p-6">
            <h3 className="card-header text-lg">Capital Gain Estimator – Blended Expected Return Band</h3>
            <p className="card-subtitle mb-6">Projected Dividend Yield + Expected Price Appreciation Range</p>
            {capitalGain && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                  <h4 className="text-slate-600 text-sm font-medium mb-2">Conservative Scenario</h4>
                  <p className="text-slate-700">Dividend: {capitalGain.conservative?.dividend?.toFixed(2)}% + Appreciation: {capitalGain.conservative?.appreciation}% = <strong className="text-teal-600">{capitalGain.conservative?.blended?.toFixed(2)}%</strong></p>
                </div>
                <div className="p-4 rounded-xl bg-teal-50 border border-teal-200">
                  <h4 className="text-slate-600 text-sm font-medium mb-2">Base Scenario</h4>
                  <p className="text-slate-700">Dividend: {capitalGain.base?.dividend?.toFixed(2)}% + Appreciation: {capitalGain.base?.appreciation}% = <strong className="text-teal-600">{capitalGain.base?.blended?.toFixed(2)}%</strong></p>
                </div>
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                  <h4 className="text-slate-600 text-sm font-medium mb-2">Optimistic Scenario</h4>
                  <p className="text-slate-700">Dividend: {capitalGain.optimistic?.dividend?.toFixed(2)}% + Appreciation: {capitalGain.optimistic?.appreciation}% = <strong className="text-teal-600">{capitalGain.optimistic?.blended?.toFixed(2)}%</strong></p>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <Disclaimer />
    </div>
  );
}
