import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api';

const navItems = [
  { path: '/', label: 'Dashboard' },
  { path: '/dividend-calendar', label: 'Dividend Calendar' },
  { path: '/weak-month-optimizer', label: 'Weak Month Optimizer' },
  { path: '/ai-risk-dashboard', label: 'AI Risk Dashboard' },
  { path: '/forecast-engine', label: 'Forecast Engine' },
  { path: '/salary-simulator', label: 'Salary Replacement Simulator' },
  { path: '/reporting-cycles', label: 'PSX Reporting Cycles' },
];

const Disclaimer = () => (
  <footer className="mt-auto border-t border-slate-700/50 px-4 py-3 text-xs text-slate-400 bg-slate-900/50">
    This platform provides analytical insights based on historical and probabilistic models. It does not constitute investment advice. Users should conduct further research before making financial decisions.
  </footer>
);

export default function Layout({ children }) {
  const location = useLocation();
  const [dataUpdated, setDataUpdated] = useState(null);

  useEffect(() => {
    api.getDataStatus()
      .then(res => setDataUpdated(res.data.formatted || res.data.lastUpdated))
      .catch(() => setDataUpdated(new Date().toLocaleString()));
  }, []);

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-slate-900 via-slate-900 to-teal-950/30 text-slate-100">
      {/* Sidebar */}
      <aside className="w-72 flex flex-col bg-slate-900/95 backdrop-blur-xl border-r border-slate-700/50 shadow-2xl">
        <div className="p-6 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center text-white font-bold text-lg shadow-glow">
              D
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-teal-400 to-cyan-400 bg-clip-text text-transparent">DividendFlow PK</h1>
              <p className="text-xs text-slate-500">AI Dividend Intelligence for PSX</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map(({ path, label }) => (
            <Link
              key={path}
              to={path}
              className={`block px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                location.pathname === path
                  ? 'bg-gradient-to-r from-teal-500/20 to-teal-600/10 text-teal-300 border border-teal-500/30 shadow-glow'
                  : 'text-slate-400 hover:bg-slate-800/80 hover:text-white hover:border border-transparent'
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <Disclaimer />
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b border-slate-700/50 flex items-center justify-between px-8 bg-slate-900/60 backdrop-blur-sm">
          <h2 className="text-xl font-semibold text-slate-100">
            {navItems.find(n => n.path === location.pathname)?.label || 'Dashboard'}
          </h2>
          {dataUpdated && (
            <span className="text-sm text-teal-400/90 font-medium px-4 py-2 rounded-lg bg-slate-800/80 border border-slate-700/50">
              PSX data last updated: {dataUpdated}
            </span>
          )}
        </header>
        <div className="flex-1 overflow-auto p-8 bg-slate-950/20">
          <div className="animate-fade-in max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
