import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { api } from '../api';
import Disclaimer from '../components/Disclaimer';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

/** One row per company (highest yield), then top 5 — must match list shown in UI so risk API is called for the same symbols. */
function getTopYieldRows(dividends) {
  const byCompany = new Map();
  (dividends || []).forEach(d => {
    const c = (d.Company || d.company || '').trim();
    const y = parseFloat(d.Dividend_yield || d.dividend_yield) || 0;
    const existing = byCompany.get(c);
    if (!existing || (parseFloat(existing.Dividend_yield || existing.dividend_yield) || 0) < y) byCompany.set(c, d);
  });
  return [...byCompany.values()]
    .sort((a, b) => (parseFloat(b.Dividend_yield || b.dividend_yield) || 0) - (parseFloat(a.Dividend_yield || a.dividend_yield) || 0))
    .slice(0, 5);
}

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    y: { grid: { color: 'rgba(148, 163, 184, 0.3)' }, ticks: { color: '#64748b' } },
    x: { grid: { display: false }, ticks: { color: '#64748b' } },
  },
};

export default function Dashboard() {
  const [dividends, setDividends] = useState([]);
  const [monthCoverage, setMonthCoverage] = useState(null);
  const [riskAlerts, setRiskAlerts] = useState([]);
  const [dailyNews, setDailyNews] = useState({ priceChanges: [], priceCommentary: [] });
  const [loading, setLoading] = useState(true);
  const [stockRisks, setStockRisks] = useState({});

  useEffect(() => {
    const fetch = async () => {
      try {
        const [divRes, covRes, newsRes] = await Promise.all([
          api.getDividends(),
          api.getMonthCoverage(),
          api.getDailyNews().catch(() => ({ data: {} }))
        ]);
        setDividends(divRes.data);
        setMonthCoverage(covRes.data);
        setRiskAlerts([
          { company: 'OGDC', level: 'Moderate', message: 'Regulatory scrutiny data-driven signal' },
          { company: 'PSO', level: 'Elevated', message: 'Volatility indicators suggest caution' }
        ]);
        setDailyNews(newsRes.data || {});
        
        // Same top-5 as on-screen (dedupe by company); previously used raw rows so 5th ticker could miss risk (e.g. KAPCO).
        const topYieldStocks = getTopYieldRows(divRes.data || []);
        
        const riskPromises = topYieldStocks.map(d => {
          const symbol = (d.Company || d.company || '').trim();
          return axios.get(`${API_BASE}/stock-risk/${symbol}`)
            .then(res => ({ symbol, data: res.data }))
            .catch(() => ({ symbol, data: null }));
        });
        
        const risks = await Promise.all(riskPromises);
        const riskMap = {};
        risks.forEach(r => {
          if (r.data && !r.data.error) {
            riskMap[r.symbol] = r.data;
          }
        });
        setStockRisks(riskMap);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const heatmapData = monthCoverage ? monthNames.map((m, i) => ({
    month: m,
    count: monthCoverage.monthCoverage?.[i + 1]?.count || 0
  })) : [];

  const topYield = getTopYieldRows(dividends);

  const chartData = {
    labels: heatmapData.map(d => d.month),
    datasets: [{
      label: 'Dividend-paying companies',
      data: heatmapData.map(d => d.count),
      backgroundColor: 'rgba(45, 212, 191, 0.5)',
      borderColor: 'rgba(45, 212, 191, 0.9)',
      borderWidth: 1,
      borderRadius: 6,
    }]
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-teal-200 border-t-teal-500 rounded-full animate-spin" />
          <p className="text-slate-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card p-6 animate-slide-up border-l-4 border-l-teal-500" style={{ animationDelay: '0ms' }}>
          <h3 className="card-header">Monthly Dividend Heatmap</h3>
          <p className="card-subtitle">Companies paying dividends by month</p>
          <div className="h-52 mt-4">
            <Bar data={chartData} options={chartOptions} />
          </div>
        </div>
        <div className="card p-6 animate-slide-up border-l-4 border-l-emerald-500" style={{ animationDelay: '50ms' }}>
          <h3 className="card-header">Top Dividend Yield</h3>
          <p className="card-subtitle">Highest yielding PSX companies with NCCPL risk indicators</p>
          <ul className="mt-4 space-y-3">
            {topYield.map((d, i) => {
              const symbol = (d.Company || d.company || '').trim();
              const risk = stockRisks[symbol];
              const riskBadge = risk ? (
                risk.risk_label === 'Low' ? <span className="text-xs px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 border border-emerald-300 ml-2">🛡️ Low Risk</span> :
                risk.risk_label === 'Moderate' ? <span className="text-xs px-2 py-1 rounded-lg bg-amber-100 text-amber-700 border border-amber-300 ml-2">⚖️ Moderate</span> :
                <span className="text-xs px-2 py-1 rounded-lg bg-rose-100 text-rose-700 border border-rose-300 ml-2">🚨 High Risk</span>
              ) : null;
              
              return (
                <li key={i} className="flex flex-col py-2 border-b border-slate-200 last:border-0">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center">
                      <span className="font-medium text-slate-700">{symbol}</span>
                      {riskBadge}
                    </div>
                    <span className="px-3 py-1 rounded-xl bg-emerald-100 text-emerald-700 font-bold">{(d.Dividend_yield || d.dividend_yield || 0)}%</span>
                  </div>
                  {risk && (
                    <div className="text-[10px] text-slate-500 mt-1">
                      VaR: {risk.var}% • Haircut: {risk.haircut}%
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="card p-6 animate-slide-up border-l-4 border-l-amber-500" style={{ animationDelay: '100ms' }}>
          <h3 className="card-header">AI Risk Alerts</h3>
          <p className="card-subtitle">Data-driven risk signals</p>
          <ul className="mt-4 space-y-3">
            {riskAlerts.map((r, i) => (
              <li key={i} className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                <span className="font-semibold text-slate-800">{r.company}</span>
                <span className="mx-2 text-amber-600 font-bold">• {r.level}</span>
                <p className="text-sm text-slate-600 mt-1">{r.message}</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-6 animate-slide-up flex flex-col justify-center border-l-4 border-l-violet-500 bg-gradient-to-br from-violet-50/50 to-transparent" style={{ animationDelay: '150ms' }}>
          <h3 className="card-header">Portfolio Income</h3>
          <p className="card-subtitle">Project your dividend income</p>
          <p className="text-3xl font-bold bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent mt-4">Salary Simulator</p>
          <p className="text-sm text-slate-600 mt-2">Estimate required portfolio for target income</p>
          <Link to="/salary-simulator" className="mt-4 btn-primary inline-block text-center">Try it →</Link>
        </div>
      </div>

      {(dailyNews.priceChanges?.length > 0) && (
        <div className="card p-6 animate-slide-up">
          <h3 className="card-header">Today vs Yesterday</h3>
          <p className="card-subtitle">
            Today vs yesterday. Updated daily after market close (5pm PKT).
            {dailyNews.priceChanges?.[0]?.Date && (
              <span className="block text-slate-500 text-xs mt-1">As of {dailyNews.priceChanges[0].Date}</span>
            )}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
              <h4 className="text-sm font-bold text-emerald-700 mb-2">Top Stock Appreciations</h4>
              <ul className="space-y-2">
                {(dailyNews.priceChanges || []).filter(c => (parseFloat(c.ChangePct) || 0) > 0).slice(0, 5).map((c, i) => (
                  <li key={i} className="flex justify-between items-center py-2 border-b border-emerald-100 last:border-0">
                    <span className="text-slate-700 font-medium">{c.Company}</span>
                    <span className="text-emerald-600 font-bold">+{c.ChangePct}%</span>
                  </li>
                ))}
              </ul>
              {(() => {
                const gainers = (dailyNews.priceChanges || []).filter(c => (parseFloat(c.ChangePct) || 0) > 0);
                const decliners = (dailyNews.priceChanges || []).filter(c => (parseFloat(c.ChangePct) || 0) < 0);
                if (gainers.length === 0 && decliners.length === 0) {
                  return <p className="text-slate-500 text-sm py-2">No significant price changes today — all tracked stocks flat.</p>;
                }
                if (gainers.length === 0) return <p className="text-slate-600 text-sm py-2">No gainers today — all tracked stocks declined.</p>;
                return null;
              })()}
            </div>
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200">
              <h4 className="text-sm font-bold text-rose-700 mb-2">Worst Stock Price Plunges</h4>
              <ul className="space-y-2">
                {(dailyNews.priceChanges || []).filter(c => (parseFloat(c.ChangePct) || 0) < 0).slice(0, 5).map((c, i) => (
                  <li key={i} className="flex justify-between items-center py-2 border-b border-rose-100 last:border-0">
                    <span className="text-slate-700 font-medium">{c.Company}</span>
                    <span className="text-rose-600 font-bold">{c.ChangePct}%</span>
                  </li>
                ))}
              </ul>
              {(() => {
                const gainers = (dailyNews.priceChanges || []).filter(c => (parseFloat(c.ChangePct) || 0) > 0);
                const decliners = (dailyNews.priceChanges || []).filter(c => (parseFloat(c.ChangePct) || 0) < 0);
                if (gainers.length === 0 && decliners.length === 0) return null;
                if (decliners.length === 0) return <p className="text-slate-600 text-sm py-2">No decliners today — all tracked stocks gained.</p>;
                return null;
              })()}
            </div>
          </div>
        </div>
      )}

      <Disclaimer />
    </div>
  );
}
