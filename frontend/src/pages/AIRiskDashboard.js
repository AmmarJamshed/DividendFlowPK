import { useState, useEffect } from 'react';
import { api } from '../api';
import Disclaimer from '../components/Disclaimer';

export default function AIRiskDashboard() {
  const [companies, setCompanies] = useState(['HBL', 'MCB', 'OGDC', 'PPL', 'PSO']);
  const [selected, setSelected] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dailyNews, setDailyNews] = useState({ news: [], commentary: [], priceChanges: [], priceCommentary: [] });
  const [nccp lRisk, setNccplRisk] = useState(null);

  useEffect(() => {
    api.getDividends()
      .then(res => {
        const names = [...new Set((res.data || []).map(d => d.Company || d.company).filter(Boolean))].sort();
        if (names.length) setCompanies(names);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    api.getDailyNews()
      .then(res => setDailyNews(res.data || { news: [], commentary: [], priceChanges: [], priceCommentary: [] }))
      .catch(() => {});
  }, []);

  const analyze = () => {
    if (!selected) return;
    setLoading(true);
    setResult(null);
    setNccplRisk(null);
    
    // Fetch AI risk analysis
    api.getRiskScore(selected)
      .then(res => setResult(res.data))
      .catch(err => setResult({ riskScore: 50, riskCategory: 'Moderate', analysis: err.message }))
      .finally(() => setLoading(false));
    
    // Fetch NCCPL risk data
    fetch(`/api/stock-risk/${selected}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && !data.error) {
          setNccplRisk(data);
        }
      })
      .catch(() => {});
  };

  const getRiskStyles = (cat) => {
    if (cat === 'Low') return { text: 'text-emerald-700', bg: 'from-emerald-400 to-teal-500', badge: 'bg-emerald-100 text-emerald-800 border-2 border-emerald-300', icon: '🛡️' };
    if (cat === 'Moderate') return { text: 'text-amber-700', bg: 'from-amber-400 to-orange-500', badge: 'bg-amber-100 text-amber-800 border-2 border-amber-300', icon: '⚖️' };
    if (cat === 'Elevated') return { text: 'text-orange-700', bg: 'from-orange-400 to-rose-500', badge: 'bg-orange-100 text-orange-800 border-2 border-orange-300', icon: '⚠️' };
    return { text: 'text-red-700', bg: 'from-rose-500 to-red-600', badge: 'bg-rose-100 text-rose-800 border-2 border-rose-300', icon: '🚨' };
  };

  const byCompany = (arr, key) => {
    const m = {};
    (arr || []).forEach(item => {
      const c = item.Company || item.company;
      if (!c) return;
      if (!m[c]) m[c] = [];
      m[c].push(item);
    });
    return m;
  };
  const newsByCo = byCompany(dailyNews.news, 'Company');
  const commentaryByCo = (dailyNews.commentary || []).reduce((acc, c) => {
    acc[c.Company || c.company] = c; return acc;
  }, {});

  const hasNews = dailyNews.news?.length > 0 || dailyNews.commentary?.length > 0;
  const hasPriceChanges = dailyNews.priceChanges?.length > 0 || dailyNews.priceCommentary?.length > 0;
  const gainers = (dailyNews.priceChanges || []).filter(c => (parseFloat(c.ChangePct) || 0) > 0).slice(0, 5);
  const decliners = (dailyNews.priceChanges || []).filter(c => (parseFloat(c.ChangePct) || 0) < 0).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="card p-6 border-l-4 border-l-teal-500">
        <h3 className="card-header text-lg">Daily News & AI Commentary</h3>
        <p className="card-subtitle mb-4">Latest news and Groq-powered commentary on adverse events</p>
        <div className="space-y-4 max-h-[400px] overflow-y-auto">
          {hasNews && Object.keys(newsByCo).length > 0 ? Object.entries(newsByCo).slice(0, 12).map(([co, items]) => (
            <div key={co} className="p-4 rounded-xl bg-teal-50 border border-teal-200">
              <div className="font-semibold text-teal-700 mb-2">{co}</div>
              <ul className="space-y-1 text-sm text-slate-600 mb-2">
                {items.slice(0, 3).map((n, i) => (
                  <li key={i}>{n.Headline || n.headline}</li>
                ))}
              </ul>
              {commentaryByCo[co]?.Commentary && (
                <div className="text-sm text-slate-500 italic border-t border-teal-200 pt-2 mt-2">
                  {commentaryByCo[co].Commentary}
                </div>
              )}
            </div>
          )) : (
            <p className="text-slate-500 text-sm py-4">No news yet. Run the daily news scraper to populate. Data updates after each scrape (5pm PKT).</p>
          )}
        </div>
      </div>

      <div className="card p-6 border-l-4 border-l-emerald-500">
        <h3 className="card-header text-lg">Today vs Yesterday — Price Movers</h3>
        <p className="card-subtitle mb-4">
          Daily stock appreciations and plunges with Groq-powered analysis based on news.
          {(dailyNews.priceChanges?.length > 0 && dailyNews.priceChanges[0]?.Date) && (
            <span className="block text-teal-600 font-medium mt-1">From last scrape: {dailyNews.priceChanges[0].Date}</span>
          )}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
            <h4 className="text-sm font-bold text-emerald-700 mb-2">Top Stock Appreciations</h4>
            <ul className="space-y-2">
              {gainers.length > 0 ? gainers.map((c, i) => (
                <li key={i} className="p-3 rounded-xl bg-white/80 border border-emerald-100">
                  <span className="font-medium text-slate-700">{c.Company}</span>
                  <span className="mx-2 text-emerald-600 font-bold">+{c.ChangePct}%</span>
                  <span className="text-slate-500 text-sm">(Rs {c.Price})</span>
                  {(dailyNews.priceCommentary || []).find(p => p.Company === c.Company && p.Direction === 'gain')?.Commentary && (
                    <p className="text-xs text-slate-500 mt-1 italic">
                      {(dailyNews.priceCommentary || []).find(p => p.Company === c.Company && p.Direction === 'gain').Commentary}
                    </p>
                  )}
                </li>
              )) : (
                <p className="text-slate-500 text-sm py-2">No gainers today. Data updates after each scrape.</p>
              )}
            </ul>
          </div>
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200">
            <h4 className="text-sm font-bold text-rose-700 mb-2">Worst Stock Price Plunges</h4>
            <ul className="space-y-2">
              {decliners.length > 0 ? decliners.map((c, i) => (
                <li key={i} className="p-3 rounded-xl bg-white/80 border border-rose-100">
                  <span className="font-medium text-slate-700">{c.Company}</span>
                  <span className="mx-2 text-rose-600 font-bold">{c.ChangePct}%</span>
                  <span className="text-slate-500 text-sm">(Rs {c.Price})</span>
                  {(dailyNews.priceCommentary || []).find(p => p.Company === c.Company && p.Direction === 'decline')?.Commentary && (
                    <p className="text-xs text-slate-500 mt-1 italic">
                      {(dailyNews.priceCommentary || []).find(p => p.Company === c.Company && p.Direction === 'decline').Commentary}
                    </p>
                  )}
                </li>
              )) : (
                <p className="text-slate-500 text-sm py-2">No decliners today. Data updates after each scrape.</p>
              )}
            </ul>
          </div>
        </div>
      </div>

      <div className="card p-6 border-l-4 border-l-violet-500">
        <h3 className="card-header text-lg">AI Adverse Media Analysis</h3>
        <p className="card-subtitle mb-6">Groq-powered analysis of governance risk, regulatory issues, and sentiment. Risk level elevated based on sentiment and volatility indicators when applicable.</p>
        <div className="flex flex-wrap gap-2 mb-6">
          {companies.map(c => (
            <button
              key={c}
              onClick={() => { setSelected(c); setResult(null); }}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                selected === c
                  ? 'bg-gradient-to-r from-teal-500 to-teal-600 text-white shadow-lg shadow-teal-300/40'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800 border border-slate-200'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <button onClick={analyze} disabled={!selected || loading} className="btn-primary">
          {loading ? 'Analyzing...' : 'Analyze Risk'}
        </button>
      </div>

      {result && (() => {
        const styles = getRiskStyles(result.riskCategory || 'Moderate');
        return (
          <div className="card p-6 overflow-hidden relative">
            <div className={`absolute inset-0 opacity-5 bg-gradient-to-br ${styles.bg}`} aria-hidden />
            <div className="relative">
              <h3 className="card-header text-xl mb-6 flex items-center gap-2">
                <span className="text-2xl">{styles.icon}</span>
                Results for {result.companyName || selected}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <div className={`p-5 rounded-2xl bg-gradient-to-br ${styles.bg} text-white shadow-lg transition-transform hover:scale-[1.02]`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-white/90 text-sm font-semibold">Risk Score</span>
                    <span className="text-lg">📊</span>
                  </div>
                  <p className="font-bold text-3xl">{result.riskScore}/100</p>
                </div>
                <div className={`p-5 rounded-2xl ${styles.badge} shadow-md transition-transform hover:scale-[1.02]`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-slate-600 text-sm font-semibold">Category</span>
                    <span className="text-lg">{styles.icon}</span>
                  </div>
                  <p className={`font-bold text-2xl ${styles.text}`}>{result.riskCategory}</p>
                </div>
              </div>
              
              {/* NCCPL Risk Indicators */}
              {nccplRisk && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                  <div className="p-4 rounded-xl bg-blue-50 border border-blue-200">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-blue-600 text-xs font-semibold uppercase">NCCPL Risk</span>
                    </div>
                    <p className={`font-bold text-xl ${nccplRisk.risk_label === 'Low' ? 'text-emerald-600' : nccplRisk.risk_label === 'Moderate' ? 'text-amber-600' : 'text-rose-600'}`}>
                      {nccplRisk.risk_label}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Score: {nccplRisk.risk_score}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-orange-50 border border-orange-200">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-orange-600 text-xs font-semibold uppercase">Downside Risk (VaR)</span>
                    </div>
                    <p className="font-bold text-xl text-orange-700">~{nccplRisk.var}%</p>
                    <p className="text-xs text-slate-500 mt-1">Potential loss</p>
                  </div>
                  <div className="p-4 rounded-xl bg-purple-50 border border-purple-200">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-purple-600 text-xs font-semibold uppercase">Haircut</span>
                    </div>
                    <p className="font-bold text-xl text-purple-700">{nccplRisk.haircut}%</p>
                    <p className="text-xs text-slate-500 mt-1">Margin requirement</p>
                  </div>
                </div>
              )}
              
              <div className="p-5 rounded-2xl bg-white/80 border border-slate-200 text-sm leading-relaxed whitespace-pre-wrap text-slate-700 shadow-sm">
                {result.analysis}
              </div>
              
              {nccplRisk && (
                <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                  <strong>NCCPL Insight:</strong> {nccplRisk.insight}
                  <div className="mt-2 text-[10px] text-slate-400">Source: NCCPL Market Information • Last updated: {nccplRisk.last_updated}</div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      <Disclaimer />
    </div>
  );
}
