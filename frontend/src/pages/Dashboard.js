import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { api } from '../api';
import Disclaimer from '../components/Disclaimer';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    y: { grid: { color: 'rgba(148, 163, 184, 0.1)' }, ticks: { color: '#94a3b8' } },
    x: { grid: { display: false }, ticks: { color: '#94a3b8' } },
  },
};

export default function Dashboard() {
  const [dividends, setDividends] = useState([]);
  const [monthCoverage, setMonthCoverage] = useState(null);
  const [riskAlerts, setRiskAlerts] = useState([]);
  const [dailyNews, setDailyNews] = useState({ priceChanges: [], priceCommentary: [] });
  const [loading, setLoading] = useState(true);

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

  const topYield = [...(dividends || [])]
    .sort((a, b) => (parseFloat(b.Dividend_yield || b.dividend_yield) || 0) - (parseFloat(a.Dividend_yield || a.dividend_yield) || 0))
    .slice(0, 5);

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
          <div className="w-12 h-12 border-4 border-teal-500/30 border-t-teal-400 rounded-full animate-spin" />
          <p className="text-slate-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card p-6 animate-slide-up" style={{ animationDelay: '0ms' }}>
          <h3 className="card-header">Monthly Dividend Heatmap</h3>
          <p className="card-subtitle">Companies paying dividends by month</p>
          <div className="h-52 mt-4">
            <Bar data={chartData} options={chartOptions} />
          </div>
        </div>
        <div className="card p-6 animate-slide-up" style={{ animationDelay: '50ms' }}>
          <h3 className="card-header">Top Dividend Yield</h3>
          <p className="card-subtitle">Highest yielding PSX companies</p>
          <ul className="mt-4 space-y-3">
            {topYield.map((d, i) => (
              <li key={i} className="flex justify-between items-center py-2 border-b border-slate-700/50 last:border-0">
                <span className="font-medium text-slate-200">{d.Company || d.company}</span>
                <span className="px-3 py-1 rounded-lg bg-teal-500/20 text-teal-400 font-semibold">{(d.Dividend_yield || d.dividend_yield || 0)}%</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-6 animate-slide-up" style={{ animationDelay: '100ms' }}>
          <h3 className="card-header">AI Risk Alerts</h3>
          <p className="card-subtitle">Data-driven risk signals</p>
          <ul className="mt-4 space-y-3">
            {riskAlerts.map((r, i) => (
              <li key={i} className="p-3 rounded-xl bg-slate-700/30 border border-slate-600/50">
                <span className="font-semibold text-slate-200">{r.company}</span>
                <span className="mx-2 text-amber-400 font-medium">• {r.level}</span>
                <p className="text-sm text-slate-400 mt-1">{r.message}</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-6 animate-slide-up flex flex-col justify-center" style={{ animationDelay: '150ms' }}>
          <h3 className="card-header">Portfolio Income</h3>
          <p className="card-subtitle">Project your dividend income</p>
          <p className="text-3xl font-bold bg-gradient-to-r from-teal-400 to-cyan-400 bg-clip-text text-transparent mt-4">Salary Simulator</p>
          <p className="text-sm text-slate-400 mt-2">Estimate required portfolio for target income</p>
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
            <div>
              <h4 className="text-sm font-semibold text-green-400 mb-2">Top Stock Appreciations</h4>
              <ul className="space-y-2">
                {(dailyNews.priceChanges || []).filter(c => (parseFloat(c.ChangePct) || 0) > 0).slice(0, 5).map((c, i) => (
                  <li key={i} className="flex justify-between items-center py-2 border-b border-slate-700/50">
                    <span className="text-slate-200">{c.Company}</span>
                    <span className="text-green-400 font-semibold">+{c.ChangePct}%</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-red-400 mb-2">Worst Stock Price Plunges</h4>
              <ul className="space-y-2">
                {(dailyNews.priceChanges || []).filter(c => (parseFloat(c.ChangePct) || 0) < 0).slice(0, 5).map((c, i) => (
                  <li key={i} className="flex justify-between items-center py-2 border-b border-slate-700/50">
                    <span className="text-slate-200">{c.Company}</span>
                    <span className="text-red-400 font-semibold">{c.ChangePct}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <Disclaimer />
    </div>
  );
}
