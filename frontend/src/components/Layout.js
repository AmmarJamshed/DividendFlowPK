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
  <footer className="mt-auto border-t border-slate-200/80 px-4 py-3 text-xs text-slate-600 bg-[#f0eeea]/80">
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
    <div className="min-h-screen flex text-slate-700 relative">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/20 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar - Pokémon-style light grey nav */}
      <aside
        className={`fixed lg:relative inset-y-0 left-0 z-50 w-72 flex flex-col bg-[#f0eeea]/98 backdrop-blur-xl border-r border-slate-200/80 shadow-xl transform transition-transform duration-300 ease-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <div className="p-4 lg:p-6 border-b border-slate-200/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-teal-500 via-teal-400 to-cyan-500 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-teal-400/40 shrink-0">
              D
            </div>
            <div className="min-w-0">
              <h1 className="text-lg lg:text-xl font-bold bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent truncate">DividendFlow PK</h1>
              <p className="text-xs text-slate-500 hidden sm:block">AI Dividend Intelligence for PSX</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700"
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
              className={`block px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-200 ${
                location.pathname === path
                  ? 'bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-400/30'
                  : 'text-slate-600 hover:bg-white/80 hover:text-slate-800 border border-transparent'
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
        <header className="h-14 lg:h-16 border-b border-slate-200/80 flex items-center justify-between gap-3 px-4 lg:px-8 bg-[#e8e6e2]/90 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700 shrink-0"
              aria-label="Open menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <h2 className="text-base lg:text-xl font-semibold text-slate-800 truncate">
              {navItems.find(n => n.path === location.pathname)?.label || 'Dashboard'}
            </h2>
          </div>
          {dataUpdated && (
            <span className="hidden sm:inline text-xs lg:text-sm text-white font-semibold px-3 py-1.5 lg:px-4 lg:py-2 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 shadow-md shrink-0">
              {dataUpdated}
            </span>
          )}
        </header>
        <div className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8 bg-transparent">
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
