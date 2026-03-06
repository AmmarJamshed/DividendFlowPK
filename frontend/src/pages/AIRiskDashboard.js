import { useState, useEffect } from 'react';
import { api } from '../api';
import Disclaimer from '../components/Disclaimer';

export default function AIRiskDashboard() {
  const [companies, setCompanies] = useState(['HBL', 'MCB', 'OGDC', 'PPL', 'PSO']);
  const [selected, setSelected] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getDividends()
      .then(res => {
        const names = [...new Set((res.data || []).map(d => d.Company || d.company).filter(Boolean))].sort();
        if (names.length) setCompanies(names);
      })
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

  return (
    <div className="space-y-6">
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
          <div className="grid grid-cols-2 gap-4 mb-6">
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
