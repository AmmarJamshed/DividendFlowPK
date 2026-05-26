import { useState, useEffect, useTransition, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api';
import RobotCursor from './RobotCursor';
import AIGuidance from './AIGuidance';
import AmmarCursorGuide from './AmmarCursorGuide';
import { useAIAssistance } from '../context/AIAssistanceContext';

const navItems = [
  { path: '/', label: 'Home', icon: '🏠', hint: 'Your overview' },
  { path: '/dividend-calendar', label: 'Dividend calendar', icon: '📅', hint: 'When payouts land' },
  { path: '/market-closing-prices', label: 'Market prices', icon: '📊', hint: 'Today’s movers' },
  { path: '/forecast-engine', label: 'Forecast', icon: '▥', hint: 'Volatility ranges' },
  { path: '/salary-simulator', label: 'Income planner', icon: '💰', hint: 'Salary vs dividends' },
  { path: '/reporting-cycles', label: 'Reporting cycles', icon: '📋', hint: 'Earnings seasons' },
];

function AiToggleSpinner({ className }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

const Disclaimer = () => (
  <footer className="mt-auto border-t border-slate-200/80 px-4 py-3 text-[11px] text-slate-600 bg-slate-50/90 leading-relaxed">
    For learning and research only — not buy/sell advice. Numbers come from saved PSX files; always double-check with your broker or PSX before acting.
  </footer>
);

export default function Layout({ children }) {
  const location = useLocation();
  const { enabled: aiAssistanceOn, setEnabled: setAiAssistance } = useAIAssistance();
  const [isAiTogglePending, startAiToggleTransition] = useTransition();
  const [aiToggleMinSpin, setAiToggleMinSpin] = useState(false);
  const aiSpinTimerRef = useRef(null);
  const [dataUpdated, setDataUpdated] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const aiToggleLoading = isAiTogglePending || aiToggleMinSpin;

  useEffect(() => {
    api.getDataStatus()
      .then(res => setDataUpdated(res.data.formatted || res.data.lastUpdated))
      .catch(() => setDataUpdated(new Date().toLocaleString()));
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    return () => {
      if (aiSpinTimerRef.current) window.clearTimeout(aiSpinTimerRef.current);
    };
  }, []);

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
        className={`fixed lg:relative inset-y-0 left-0 z-50 w-72 flex flex-col bg-white/95 backdrop-blur-xl border-r border-slate-200/80 shadow-xl transform transition-transform duration-300 ease-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <div className="p-4 lg:p-6 border-b border-slate-200/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-teal-500 via-teal-400 to-cyan-500 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-teal-400/40 shrink-0">
              D
            </div>
            <div className="min-w-0">
              <h1 className="text-lg lg:text-xl font-bold bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent truncate">DividendFlow PK</h1>
              <p className="text-xs text-slate-500 hidden sm:block">PSX dividends &amp; prices, plain and simple</p>
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
          {navItems.map(({ path, label, icon, hint }) => (
            <Link
              key={path}
              to={path}
              className={`flex items-start gap-3 px-4 py-3 rounded-2xl transition-all duration-200 ${
                location.pathname === path
                  ? 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow-lg shadow-teal-500/25'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
              }`}
            >
              <span className="text-lg leading-none mt-0.5" aria-hidden>
                {icon}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold">{label}</span>
                <span
                  className={`block text-[11px] font-medium mt-0.5 ${
                    location.pathname === path ? 'text-teal-50' : 'text-slate-500'
                  }`}
                >
                  {hint}
                </span>
              </span>
            </Link>
          ))}
        </nav>
        <Disclaimer />
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="min-h-14 lg:min-h-16 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-2 py-2 px-4 lg:px-8 bg-white/80 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700 shrink-0"
              aria-label="Open menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <h2 className="text-base lg:text-xl font-semibold text-slate-800 truncate">
              {navItems.find((n) => n.path === location.pathname)?.label || 'Dashboard'}
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-auto sm:ml-0">
            <button
              type="button"
              onClick={() => {
                if (aiToggleLoading) return;
                if (aiSpinTimerRef.current) window.clearTimeout(aiSpinTimerRef.current);
                setAiToggleMinSpin(true);
                aiSpinTimerRef.current = window.setTimeout(() => {
                  setAiToggleMinSpin(false);
                  aiSpinTimerRef.current = null;
                }, 320);
                startAiToggleTransition(() => {
                  setAiAssistance((v) => !v);
                });
              }}
              aria-pressed={aiAssistanceOn}
              aria-busy={aiToggleLoading}
              disabled={aiToggleLoading}
              title={
                aiToggleLoading
                  ? 'Applying…'
                  : aiAssistanceOn
                    ? 'Disable AI assistance (Ammar cursor guide)'
                    : 'Enable AI assistance — Ammar explains what you hover'
              }
              className={`inline-flex items-center justify-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all whitespace-nowrap min-w-[7.5rem] sm:min-w-[10.5rem] ${
                aiAssistanceOn
                  ? 'bg-gradient-to-r from-teal-600 to-cyan-600 border-teal-500 text-white shadow-md shadow-teal-500/25'
                  : 'bg-white/90 border-slate-200 text-slate-600 hover:border-teal-300 hover:text-teal-800'
              } ${aiToggleLoading ? 'opacity-90 cursor-wait' : ''}`}
            >
              {aiToggleLoading ? (
                <>
                  <AiToggleSpinner className="w-3.5 h-3.5 shrink-0 animate-spin text-current" />
                  <span className="hidden sm:inline">Applying…</span>
                  <span className="sm:hidden">…</span>
                </>
              ) : (
                <>
                  <span className="hidden sm:inline">{aiAssistanceOn ? 'AI assistance on' : 'Enable AI assistance'}</span>
                  <span className="sm:hidden">{aiAssistanceOn ? 'AI on' : 'AI off'}</span>
                </>
              )}
            </button>
            {dataUpdated && (
              <span className="hidden sm:inline text-xs lg:text-sm text-white font-semibold px-3 py-1.5 lg:px-4 lg:py-2 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 shadow-md shrink-0 max-w-[200px] lg:max-w-none truncate">
                {dataUpdated}
              </span>
            )}
          </div>
        </header>
        <div
          data-app-scroll-root
          className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8 bg-transparent"
        >
          <div className="animate-fade-in max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
      <RobotCursor />
      <AmmarCursorGuide />
      <AIGuidance />
    </div>
  );
}
