import { useState, useEffect } from 'react';
import { api } from '../api';
import Disclaimer from '../components/Disclaimer';

export default function AIRiskDashboard() {
  const [companies, setCompanies] = useState(['HBL', 'MCB', 'OGDC', 'PPL', 'PSO']);
  const [selected, setSelected] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dailyNews, setDailyNews] = useState({ news: [], commentary: [], priceChanges: [], priceCommentary: [] });

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
    api.getRiskScore(selected)
      .then(res => setResult(res.data))
      .catch(err => setResult({ riskScore: 50, riskCategory: 'Moderate', analysis: err.message }))
      .finally(() => setLoading(false));
  };

  const getRiskColor = (cat) => {
    if (cat === 'Low') return 'text-green-400';
    if (cat === 'Moderate') return 'text-amber-400';
    if (cat === 'Elevated') return 'text-orange-400';
    return 'text-red-400';
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

  return (
    <div className="space-y-6">
      {(dailyNews.news?.length > 0 || dailyNews.commentary?.length > 0) && (
        <div className="card p-6 border-teal-500/20">
          <h3 className="card-header text-lg">Daily News & AI Commentary</h3>
          <p className="card-subtitle mb-4">Latest news and Groq-powered commentary on adverse events</p>
          <div className="space-y-4 max-h-[400px] overflow-y-auto">
            {Object.keys(newsByCo).length > 0 ? Object.entries(newsByCo).slice(0, 12).map(([co, items]) => (
              <div key={co} className="p-4 rounded-xl bg-slate-700/30 border border-slate-600/50">
                <div className="font-semibold text-teal-400 mb-2">{co}</div>
                <ul className="space-y-1 text-sm text-slate-300 mb-2">
                  {items.slice(0, 3).map((n, i) => (
                    <li key={i}>{n.Headline || n.headline}</li>
                  ))}
                </ul>
                {commentaryByCo[co]?.Commentary && (
                  <div className="text-sm text-slate-400 italic border-t border-slate-600/50 pt-2 mt-2">
                    {commentaryByCo[co].Commentary}
                  </div>
                )}
              </div>
            )) : (
              <p className="text-slate-400 text-sm">No news yet. Run the daily news scraper to populate.</p>
            )}
          </div>
        </div>
      )}

      {(dailyNews.priceChanges?.length > 0 || dailyNews.priceCommentary?.length > 0) && (
        <div className="card p-6 border-teal-500/20">
          <h3 className="card-header text-lg">Today vs Yesterday — Price Movers</h3>
          <p className="card-subtitle mb-4">Daily stock appreciations and plunges with Groq-powered analysis based on news</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-semibold text-green-400 mb-2">Top Stock Appreciations</h4>
              <ul className="space-y-2">
                {(dailyNews.priceChanges || [])
                  .filter(c => (parseFloat(c.ChangePct) || 0) > 0)
                  .slice(0, 5)
                  .map((c, i) => (
                    <li key={i} className="p-3 rounded-lg bg-slate-700/30 border border-slate-600/50">
                      <span className="font-medium text-slate-200">{c.Company}</span>
                      <span className="mx-2 text-green-400">+{c.ChangePct}%</span>
                      <span className="text-slate-400 text-sm">(Rs {c.Price})</span>
                      {(dailyNews.priceCommentary || []).find(p => p.Company === c.Company && p.Direction === 'gain')?.Commentary && (
                        <p className="text-xs text-slate-400 mt-1 italic">
                          {(dailyNews.priceCommentary || []).find(p => p.Company === c.Company && p.Direction === 'gain').Commentary}
                        </p>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-red-400 mb-2">Worst Stock Price Plunges</h4>
              <ul className="space-y-2">
                {(dailyNews.priceChanges || [])
                  .filter(c => (parseFloat(c.ChangePct) || 0) < 0)
                  .slice(0, 5)
                  .map((c, i) => (
                    <li key={i} className="p-3 rounded-lg bg-slate-700/30 border border-slate-600/50">
                      <span className="font-medium text-slate-200">{c.Company}</span>
                      <span className="mx-2 text-red-400">{c.ChangePct}%</span>
                      <span className="text-slate-400 text-sm">(Rs {c.Price})</span>
                      {(dailyNews.priceCommentary || []).find(p => p.Company === c.Company && p.Direction === 'decline')?.Commentary && (
                        <p className="text-xs text-slate-400 mt-1 italic">
                          {(dailyNews.priceCommentary || []).find(p => p.Company === c.Company && p.Direction === 'decline').Commentary}
                        </p>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="card p-6">
        <h3 className="card-header text-lg">AI Adverse Media Analysis</h3>
        <p className="card-subtitle mb-6">Groq-powered analysis of governance risk, regulatory issues, and sentiment. Risk level elevated based on sentiment and volatility indicators when applicable.</p>
        <div className="flex flex-wrap gap-2 mb-6">
          {companies.map(c => (
            <button
              key={c}
              onClick={() => { setSelected(c); setResult(null); }}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                selected === c
                  ? 'bg-gradient-to-r from-teal-500 to-teal-600 text-white shadow-glow'
                  : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50 hover:text-white border border-slate-600/50'
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

      {result && (
        <div className="card p-6 border-teal-500/30">
          <h3 className="card-header text-lg mb-4">Results for {result.companyName || selected}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="p-4 rounded-xl bg-slate-700/30">
              <span className="text-slate-400 text-sm">Risk Score</span>
              <p className={`font-bold text-2xl ${getRiskColor(result.riskCategory)}`}>{result.riskScore}/100</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-700/30">
              <span className="text-slate-400 text-sm">Category</span>
              <p className={`font-bold text-xl ${getRiskColor(result.riskCategory)}`}>{result.riskCategory}</p>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-slate-700/30 border border-slate-600/50 text-sm whitespace-pre-wrap text-slate-300">{result.analysis}</div>
        </div>
      )}

      <Disclaimer />
    </div>
  );
}
