import { useState, useEffect, useTransition, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api';
import RobotCursor from './RobotCursor';
import AIGuidance from './AIGuidance';
import AmmarCursorGuide from './AmmarCursorGuide';
import { useAIAssistance } from '../context/AIAssistanceContext';
import { useMarketBuddy } from '../context/MarketBuddyContext';
import { useExchange } from '../context/ExchangeContext';
import ExchangeSelector from './ExchangeSelector';
import GlobalSearch from './GlobalSearch';
import ExchangeMarketBanner from './ExchangeMarketBanner';

const LOGO = `${process.env.PUBLIC_URL || ''}/dividendflow-logo.png`;

const navItems = [
  { path: '/', label: 'Overview', icon: 'home' },
  { path: '/dividend-calendar', label: 'Dividend calendar', icon: 'calendar' },
  { path: '/market-closing-prices', label: 'Market data', icon: 'chart' },
  { path: '/forecast-engine', label: 'Forecast', icon: 'trend' },
  { path: '/salary-simulator', label: 'Income planner', icon: 'wallet' },
  { path: '/reporting-cycles', label: 'Reporting cycles', icon: 'document' },
];

function NavIcon({ name, active = false }) {
  const cls = `w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-slate-500 group-hover:text-teal-600'}`;
  switch (name) {
    case 'home':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5.5 9.5V20h13V9.5" />
        </svg>
      );
    case 'calendar':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <rect x="3.5" y="5" width="17" height="15" />
          <path d="M7.5 3v4M16.5 3v4M3.5 9.5h17" />
        </svg>
      );
    case 'chart':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M4 19.5h16" />
          <path d="M6 16v-4M12 16V8M18 16v-6" />
        </svg>
      );
    case 'trend':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M4 16.5 9.5 11l4 4 6.5-7" />
          <path d="M14 8h6v6" />
        </svg>
      );
    case 'wallet':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <rect x="3.5" y="6.5" width="17" height="11" rx="1.5" />
          <path d="M16 12h4.5" />
          <circle cx="16" cy="12" r="0.9" fill="currentColor" />
        </svg>
      );
    case 'document':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M7 3.5h7l4 4V20H7z" />
          <path d="M14 3.5v4h4M9.5 12h5M9.5 15h5" />
        </svg>
      );
    default:
      return null;
  }
}

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

function SidebarDisclaimer() {
  const { exchangeConfig } = useExchange();
  return (
    <footer className="mt-auto border-t border-slate-200/80 px-4 py-3 text-[11px] text-slate-600 bg-slate-50/90 leading-relaxed">
      For learning and research only — not buy/sell advice. Confirm figures with {exchangeConfig.code} and your broker.
    </footer>
  );
}

export default function Layout({ children }) {
  const location = useLocation();
  const { enabled: aiAssistanceOn, setEnabled: setAiAssistance } = useAIAssistance();
  const { exchange, exchangeConfig } = useExchange();
  const { open: buddyOpen, toggle: toggleBuddy, setOpen: setBuddyOpen } = useMarketBuddy();
  const [isAiTogglePending, startAiToggleTransition] = useTransition();
  const [aiToggleMinSpin, setAiToggleMinSpin] = useState(false);
  const aiSpinTimerRef = useRef(null);
  const [dataUpdated, setDataUpdated] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const aiToggleLoading = isAiTogglePending || aiToggleMinSpin;

  useEffect(() => {
    api
      .getDataStatus()
      .then((res) => {
        const base = res.data.formatted || res.data.latestTradingDate || res.data.lastUpdated;
        const storageTag = res.data.storage === 'supabase' ? ' · cloud DB' : '';
        setDataUpdated(`${exchange} · ${base}${storageTag}`);
      })
      .catch(() => setDataUpdated(`${exchange} · ${new Date().toLocaleString()}`));
  }, [exchange]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (location.hash === '#market-chat') {
      setBuddyOpen(true);
    }
  }, [location.hash, setBuddyOpen]);

  useEffect(() => {
    return () => {
      if (aiSpinTimerRef.current) window.clearTimeout(aiSpinTimerRef.current);
    };
  }, []);

  const stockMatch = location.pathname.match(/^\/stock\/([^/]+)\/([^/]+)/i);
  const pageTitle =
    navItems.find((n) => n.path === location.pathname)?.label ||
    (stockMatch
      ? `${stockMatch[1].toUpperCase()} · ${stockMatch[2].toUpperCase()}`
      : `${exchangeConfig.code} · Overview`);

  return (
    <div className="min-h-screen flex flex-col text-slate-700 relative">
      <div className="flex flex-1 min-h-0 relative">
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-slate-900/20 z-40 lg:hidden backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        <aside
          className={`fixed lg:relative inset-y-0 left-0 z-50 w-72 flex flex-col bg-white/95 backdrop-blur-xl border-r border-slate-200/80 shadow-xl transform transition-transform duration-300 ease-out lg:top-0
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
        >
          <div className="px-5 py-5 border-b border-slate-200 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3 min-w-0 group">
              <img
                src={LOGO}
                alt="DividendFlow PK"
                className="w-11 h-11 rounded-2xl shrink-0 border-2 border-teal-300/80 shadow-md shadow-teal-200/40 object-cover bg-white"
              />
              <div className="min-w-0">
                <p className="text-base font-bold bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent leading-tight">
                  DividendFlow PK
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5 hidden sm:block">{exchangeConfig.name} · {exchangeConfig.currency}</p>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-2 text-neutral-500 hover:text-neutral-900"
              aria-label="Close menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <nav className="flex-1 py-3 overflow-y-auto">
            {navItems.map(({ path, label, icon }) => {
              const active = location.pathname === path;
              return (
                <Link
                  key={path}
                  to={path}
                  className={`group flex items-center gap-3 px-4 py-3 mx-2 rounded-xl text-sm font-semibold transition-all ${
                    active
                      ? 'nav-link-active shadow-md'
                      : 'text-slate-600 hover:bg-teal-50/80 hover:text-teal-800'
                  }`}
                >
                  <NavIcon name={icon} active={active} />
                  {label}
                </Link>
              );
            })}
          </nav>
          <SidebarDisclaimer />
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden min-w-0 bg-transparent">
          <header className="min-h-14 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 py-2 px-4 lg:px-8 bg-white/90 backdrop-blur-md shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 text-neutral-600 hover:text-neutral-900 shrink-0"
                aria-label="Open menu"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <h2 className="text-base lg:text-lg font-semibold text-neutral-900 tracking-tight truncate">
                {pageTitle}
              </h2>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-auto flex-wrap justify-end">
              <GlobalSearch />
              <ExchangeSelector compact />
              <button
                type="button"
                onClick={toggleBuddy}
                aria-pressed={buddyOpen}
                aria-expanded={buddyOpen}
                aria-label={buddyOpen ? 'Close Market Buddy chat' : 'Open Market Buddy chat'}
                className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide px-3 py-2 rounded-xl border transition-colors ${
                  buddyOpen
                    ? 'text-white border-blue-500 bg-gradient-to-r from-blue-600 to-blue-500 shadow-md shadow-blue-300/40'
                    : 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100 hover:border-blue-300'
                }`}
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M4 5h16v11H8l-4 4z" strokeLinejoin="round" />
                </svg>
                <span className="hidden sm:inline">Market Buddy</span>
                <span className="sm:hidden">Buddy</span>
              </button>
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
                aria-label={aiAssistanceOn ? 'Turn off Asi assistant' : 'Turn on Asi assistant'}
                aria-busy={aiToggleLoading}
                disabled={aiToggleLoading}
                className={`text-[11px] font-bold uppercase tracking-wide px-3 py-2 rounded-xl border transition-colors ${
                  aiAssistanceOn
                    ? 'text-white border-teal-400 bg-gradient-to-r from-teal-500 to-cyan-500 shadow-md shadow-teal-300/30'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-teal-300 hover:text-teal-700'
                } ${aiToggleLoading ? 'opacity-70 cursor-wait' : ''}`}
              >
                {aiToggleLoading ? (
                  <span className="inline-flex items-center gap-1.5">
                    <AiToggleSpinner className="w-3 h-3 animate-spin" />
                    Applying
                  </span>
                ) : aiAssistanceOn ? (
                  'Asi on'
                ) : (
                  'Asi assistant'
                )}
              </button>
              {dataUpdated && (
                <span className="hidden md:inline text-[11px] font-medium text-neutral-500 tabular-nums">
                  Updated {dataUpdated}
                </span>
              )}
            </div>
          </header>

          <div data-app-scroll-root className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
            <div className="max-w-6xl mx-auto">
              {!location.pathname.startsWith('/stock/') && <ExchangeMarketBanner />}
              {children}
            </div>
          </div>
        </main>
      </div>

      <RobotCursor />
      <AmmarCursorGuide />
      <AIGuidance />
    </div>
  );
}
