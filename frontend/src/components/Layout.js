import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api';
import RobotCursor from './RobotCursor';
import AIGuidance from './AIGuidance';

const navItems = [
  { path: '/', label: 'Dashboard' },
  { path: '/dividend-calendar', label: 'Dividend Calendar' },
  { path: '/market-closing-prices', label: 'Market Closing Prices' },
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
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    api.getDataStatus()
      .then(res => setDataUpdated(res.data.formatted || res.data.lastUpdated))
      .catch(() => setDataUpdated(new Date().toLocaleString()));
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-slate-900 via-slate-900 to-teal-950/30 text-slate-100">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar - hidden on mobile unless open */}
      <aside
        className={`fixed lg:relative inset-y-0 left-0 z-50 w-72 flex flex-col bg-slate-900/98 backdrop-blur-xl border-r border-slate-700/50 shadow-2xl transform transition-transform duration-300 ease-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <div className="p-4 lg:p-6 border-b border-slate-700/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center text-white font-bold text-lg shadow-glow shrink-0">
              D
            </div>
            <div className="min-w-0">
              <h1 className="text-lg lg:text-xl font-bold bg-gradient-to-r from-teal-400 to-cyan-400 bg-clip-text text-transparent truncate">DividendFlow PK</h1>
              <p className="text-xs text-slate-500 hidden sm:block">AI Dividend Intelligence for PSX</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="Close menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
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
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="h-14 lg:h-16 border-b border-slate-700/50 flex items-center justify-between gap-3 px-4 lg:px-8 bg-slate-900/60 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white shrink-0"
              aria-label="Open menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <h2 className="text-base lg:text-xl font-semibold text-slate-100 truncate">
              {navItems.find(n => n.path === location.pathname)?.label || 'Dashboard'}
            </h2>
          </div>
          {dataUpdated && (
            <span className="hidden sm:inline text-xs lg:text-sm text-teal-400/90 font-medium px-3 py-1.5 lg:px-4 lg:py-2 rounded-lg bg-slate-800/80 border border-slate-700/50 shrink-0">
              {dataUpdated}
            </span>
          )}
        </header>
        <div className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8 bg-slate-950/20">
          <div className="animate-fade-in max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
      <RobotCursor />
      <AIGuidance />
    </div>
  );
}
