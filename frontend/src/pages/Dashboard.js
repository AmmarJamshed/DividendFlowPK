import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { api } from '../api';
import Disclaimer from '../components/Disclaimer';
import axios from 'axios';
import { buildDashboardRiskAlerts, getPktDateString, MIN_PRICE_MOVE_PCT } from '../utils/dashboardRiskAlerts';

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
  const [dailyNews, setDailyNews] = useState({
    news: [],
    commentary: [],
    priceChanges: [],
    priceCommentary: [],
  });
  const [loading, setLoading] = useState(true);
  const [stockRisks, setStockRisks] = useState({});
  /** Full headline + AI text for a selected alert */
  const [alertDetailOpen, setAlertDetailOpen] = useState(null);

  const closeAlertDetail = useCallback(() => setAlertDetailOpen(null), []);

  useEffect(() => {
    if (!alertDetailOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') closeAlertDetail();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [alertDetailOpen, closeAlertDetail]);

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
        const newsPayload = newsRes.data || {};
        setDailyNews(newsPayload);
        setRiskAlerts(
          buildDashboardRiskAlerts(newsPayload, {
            maxAlerts: 4,
            dateKey: getPktDateString(),
          })
        );
        
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6">
        <div className="card p-6 animate-slide-up border-l-4 border-l-teal-500 lg:col-span-3" style={{ animationDelay: '0ms' }}>
          <h3 className="card-header">Monthly Dividend Heatmap</h3>
          <p className="card-subtitle">Companies paying dividends by month</p>
          <div className="h-52 mt-4">
            <Bar data={chartData} options={chartOptions} />
          </div>
        </div>
        <div className="card p-6 animate-slide-up border-l-4 border-l-emerald-500 lg:col-span-3" style={{ animationDelay: '50ms' }}>
          <h3 className="card-header">Top Dividend Yield</h3>
          <p className="card-subtitle">Highest yielding PSX companies with clearing-house risk snapshot (VaR &amp; margin)</p>
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
        <div className="card p-6 animate-slide-up border-l-4 border-l-amber-500 lg:col-span-6 flex flex-col min-h-[320px]" style={{ animationDelay: '100ms' }}>
          <h3 className="card-header">AI Risk Alerts</h3>
          <p className="card-subtitle">
            Alerts appear when a <strong className="text-slate-600">public news headline</strong> lines up with a{' '}
            <strong className="text-slate-600">meaningful same-session price move</strong> (about {MIN_PRICE_MOVE_PCT}% or more vs prior close).
            Broader stories (policy, IMF, rates, subsidies) may be linked to large <em>decliners</em> when they affect the wider market.
            We don&apos;t show raw price swings without a related story. <strong className="text-slate-600">Click an alert</strong> for the article, source, and a short AI read.
          </p>
          {(riskAlerts[0]?.rotationDate || dailyNews.news?.length > 0 || dailyNews.priceChanges?.length > 0) && (
            <p className="text-[11px] text-slate-500 mt-1">
              Pakistan time (PKT): <span className="font-medium text-slate-600">{riskAlerts[0]?.rotationDate || getPktDateString()}</span>
              <span className="block mt-0.5">Refreshed daily after market close.</span>
            </p>
          )}
          <ul className="mt-4 space-y-4 flex-1 max-h-[560px] overflow-y-auto pr-1">
            {riskAlerts.length === 0 ? (
              <li className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-600">
                <p className="font-medium text-slate-700 mb-1">No qualifying alerts</p>
                <p className="mb-2">
                  Nothing matched <strong>today</strong>: we look for a <strong>news headline</strong> plus a move of at least{' '}
                  {MIN_PRICE_MOVE_PCT}% for that company (or a major market/policy story tied to a large decliner). Check back after the next session — coverage depends on what&apos;s in the public press and how stocks moved.
                </p>
                <p>
                  <Link to="/ai-risk-dashboard" className="text-teal-600 font-medium underline">AI Risk Dashboard</Link> — dig deeper on any ticker.
                </p>
              </li>
            ) : (
              riskAlerts.map((r, i) => {
                const levelStyles =
                  r.level === 'Elevated'
                    ? { badge: 'bg-rose-100 text-rose-800 border-rose-300', dot: 'bg-rose-500' }
                    : r.level === 'Moderate'
                      ? { badge: 'bg-amber-100 text-amber-800 border-amber-300', dot: 'bg-amber-500' }
                      : { badge: 'bg-sky-100 text-sky-800 border-sky-300', dot: 'bg-sky-500' };
                return (
                  <li key={`${r.company}-${i}`}>
                    <div
                      role="button"
                      tabIndex={0}
                      className="w-full text-left p-4 rounded-xl bg-amber-50/80 border border-amber-200 shadow-sm cursor-pointer transition-all hover:border-teal-400/50 hover:bg-amber-50 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
                      onClick={() => setAlertDetailOpen(r)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setAlertDetailOpen(r);
                        }
                      }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${levelStyles.dot}`} aria-hidden />
                          <span className="font-semibold text-slate-800">{r.company}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-lg border font-bold ${levelStyles.badge}`}>{r.level}</span>
                          {r.kind === 'news' && (
                            <span className="text-[10px] uppercase tracking-wide text-teal-700 font-semibold">News + move</span>
                          )}
                          {r.kind === 'macro_link' && (
                            <span className="text-[10px] uppercase tracking-wide text-violet-700 font-semibold">Macro / PSX</span>
                          )}
                        </div>
                        <span className="text-[10px] font-semibold text-teal-700 shrink-0">View details →</span>
                      </div>
                      <p className="text-sm font-medium text-slate-800 leading-snug line-clamp-2">{r.headline}</p>
                      {typeof r.priceMovePct === 'number' && r.priceMovePct !== 0 && (
                        <p className="mt-1.5 text-xs font-semibold text-slate-700">
                          Session vs prior:{' '}
                          <span className={r.priceMovePct < 0 ? 'text-rose-600' : 'text-emerald-600'}>
                            {r.priceMovePct > 0 ? '+' : ''}
                            {r.priceMovePct.toFixed(2)}%
                          </span>
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
                        <span className="text-slate-500">Source:</span>
                        {r.url ? (
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-teal-700 font-medium hover:underline break-all"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {r.source}
                          </a>
                        ) : (
                          <span className="font-medium">{r.source}</span>
                        )}
                        {r.newsDate && (
                          <span className="text-slate-400">· {String(r.newsDate).slice(0, 16)}</span>
                        )}
                      </div>
                      <div className="mt-3 pt-3 border-t border-amber-200/90">
                        <p className="text-[10px] uppercase tracking-wide text-amber-800/80 font-semibold mb-1">AI summary (preview)</p>
                        <p className="text-sm text-slate-600 leading-relaxed line-clamp-2">{r.message}</p>
                      </div>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
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

      {alertDetailOpen && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="alert-detail-title"
          onClick={closeAlertDetail}
        >
          <div
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-white border border-slate-200 shadow-2xl shadow-slate-400/20"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-amber-50/90 to-white">
              <div>
                <h4 id="alert-detail-title" className="text-lg font-bold text-slate-900">
                  {alertDetailOpen.company}
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  {alertDetailOpen.kind === 'macro_link'
                    ? 'Macro / PSX headline + declining leader'
                    : alertDetailOpen.kind === 'news'
                      ? 'Company headline + price move'
                      : 'Signal'}{' '}
                  · <span className="font-medium text-slate-600">{alertDetailOpen.level}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={closeAlertDetail}
                className="shrink-0 w-9 h-9 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 text-xl leading-none font-light"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="px-5 py-4 space-y-5">
              {typeof alertDetailOpen.priceMovePct === 'number' && alertDetailOpen.priceMovePct !== 0 && (
                <section className="rounded-xl bg-slate-100 border border-slate-200 px-3 py-2">
                  <h5 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">Session price move</h5>
                  <p className="text-sm font-semibold text-slate-800">
                    {alertDetailOpen.company}:{' '}
                    <span className={alertDetailOpen.priceMovePct < 0 ? 'text-rose-600' : 'text-emerald-600'}>
                      {alertDetailOpen.priceMovePct > 0 ? '+' : ''}
                      {alertDetailOpen.priceMovePct.toFixed(2)}%
                    </span>{' '}
                    <span className="text-slate-500 font-normal">(vs prior close in latest dataset)</span>
                  </p>
                </section>
              )}
              <section>
                <h5 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">Headline / signal</h5>
                <p className="text-base text-slate-800 leading-relaxed font-medium">{alertDetailOpen.headline}</p>
              </section>
              <section>
                <h5 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">Source</h5>
                <div className="text-sm text-slate-700">
                  {alertDetailOpen.url ? (
                    <a
                      href={alertDetailOpen.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-teal-700 font-semibold hover:underline break-all"
                    >
                      {alertDetailOpen.source}
                    </a>
                  ) : (
                    <span>{alertDetailOpen.source}</span>
                  )}
                  {alertDetailOpen.newsDate && (
                    <span className="block text-xs text-slate-500 mt-1">
                      Dated: {String(alertDetailOpen.newsDate)}
                    </span>
                  )}
                </div>
              </section>
              <section className="rounded-xl bg-slate-50 border border-slate-100 p-4">
                <h5 className="text-[11px] font-bold uppercase tracking-wide text-teal-800 mb-2">What the AI analyzed</h5>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{alertDetailOpen.message}</p>
                {alertDetailOpen.kind === 'macro_link' && (
                  <p className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-200">
                    The headline is a broader market or policy story; this ticker is shown because it had a large down move the same
                    session — a pattern common when IMF, subsidy, or rate news hits PSX leaders.
                  </p>
                )}
              </section>
              <button
                type="button"
                onClick={closeAlertDetail}
                className="w-full py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-500"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <Disclaimer />
    </div>
  );
}
