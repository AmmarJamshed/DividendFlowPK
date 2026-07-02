import { useState, useEffect, useTransition, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api';
import RobotCursor from './RobotCursor';
import AIGuidance from './AIGuidance';
import AmmarCursorGuide from './AmmarCursorGuide';
import { useAIAssistance } from '../context/AIAssistanceContext';
import { useMarketBuddy } from '../context/MarketBuddyContext';
import { useExchange } from '../context/ExchangeContext';
import GlobalSearch from './GlobalSearch';
import SiteFooter from './SiteFooter';
import CookieConsent from './CookieConsent';
import PwaInstallBanner from './PwaInstallBanner';

const LOGO = `${process.env.PUBLIC_URL || ''}/dividendflow-logo.png`;

const navItems = [
  { path: '/', label: 'Overview', icon: 'home' },
  { path: '/dividend-calendar', label: 'Dividend calendar', icon: 'calendar' },
  { path: '/market-closing-prices', label: 'Market data', icon: 'chart' },
  { path: '/ipo-calendar', label: 'IPO calendar', icon: 'ipo' },
  { path: '/forecast-engine', label: 'Forecast', icon: 'trend' },
  { path: '/salary-simulator', label: 'Income planner', icon: 'wallet' },
  { path: '/reporting-cycles', label: 'Reporting cycles', icon: 'document' },
  { path: '/market-brokers', label: 'Market brokers', icon: 'broker' },
];

function NavIcon({ name, className = 'w-4 h-4', active = false }) {
  const cls = className;
  const inactiveCls = active ? cls : `${cls} text-slate-400`;
  switch (name) {
    case 'home':
      return (
        <svg className={inactiveCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M6 10v10h12V10" />
        </svg>
      );
    case 'calendar':
      return (
        <svg className={inactiveCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      );
    case 'chart':
      return (
        <svg className={inactiveCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M4 19.5h16" />
          <path d="M6 16v-4M12 16V8M18 16v-6" />
        </svg>
      );
    case 'ipo':
      return (
        <svg className={inactiveCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M8 7h8M8 11h8M8 15h6" />
        </svg>
      );
    case 'trend':
      return (
        <svg className={inactiveCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M4 16.5 9.5 11l4 4 6.5-7" />
          <path d="M14 8h6v6" />
        </svg>
      );
    case 'wallet':
      return (
        <svg className={inactiveCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M16 12h4" />
        </svg>
      );
    case 'document':
      return (
        <svg className={inactiveCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M7 3h7l4 4v14H7z" />
          <path d="M14 3v4h4" />
        </svg>
      );
    case 'broker':
      return (
        <svg className={inactiveCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M3 21h18" />
          <path d="M5 21V7l7-4 7 4v14" />
          <path d="M9 21v-6h6v6" />
        </svg>
      );
    default:
      return null;
  }
}

function AiToggleSpinner({ className }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden>
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
    <p className="mt-auto pt-4 text-[10px] text-slate-500 leading-relaxed border-t border-slate-200/80">
      For learning and research only — not buy/sell advice. Confirm figures with {exchangeConfig.code} and your broker.
    </p>
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

  const marketBuddyButton = (
    <button
      type="button"
      onClick={toggleBuddy}
      aria-pressed={buddyOpen}
      aria-expanded={buddyOpen}
      aria-label={buddyOpen ? 'Close Market Buddy chat' : 'Open Market Buddy chat'}
      className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide px-2.5 sm:px-3 py-2 rounded-xl border transition-colors shrink-0 ${
        buddyOpen
          ? 'text-[#1E3A8A] border-white bg-white shadow-sm'
          : 'text-white border-white/30 bg-white/10 hover:bg-white/20'
      }`}
    >
      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M4 5h16v11H8l-4 4z" strokeLinejoin="round" />
      </svg>
      <span className="hidden sm:inline">Market Buddy</span>
    </button>
  );

  const asiToggleButton = (
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
      aria-label={aiAssistanceOn ? 'Turn off ASI assistant' : 'Turn on ASI assistant'}
      aria-busy={aiToggleLoading}
      disabled={aiToggleLoading}
      className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide px-2.5 sm:px-3 py-2 rounded-xl border transition-colors shrink-0 ${
        aiAssistanceOn
          ? 'text-[#1E3A8A] border-white bg-white shadow-sm'
          : 'text-white border-white/30 bg-white/10 hover:bg-white/20'
      } ${aiToggleLoading ? 'opacity-70 cursor-wait' : ''}`}
    >
      {aiToggleLoading ? (
        <>
          <AiToggleSpinner className="w-3 h-3 animate-spin" />
          <span className="hidden sm:inline">Applying</span>
        </>
      ) : aiAssistanceOn ? (
        'ASI on'
      ) : (
        <>
          <span className="sm:hidden">ASI</span>
          <span className="hidden sm:inline">ASI assistant</span>
        </>
      )}
    </button>
  );

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

  const isNavActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA] text-slate-800 font-sans">
      <header className="sticky top-0 z-50 shadow-sm">
        <div className="h-[60px] bg-[#1E3A8A] px-4 lg:px-8 flex items-center gap-4">
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            className="lg:hidden text-white p-1 rounded-md hover:bg-white/10"
            aria-label="Toggle sidebar"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <Link to="/" className="flex items-center gap-2.5 text-white shrink-0">
            <img src={LOGO} alt="" className="w-9 h-9 rounded-lg" aria-hidden />
            <span className="font-bold text-[15px] tracking-tight hidden sm:inline">
              DIVIDEND FLOW PK <span className="text-blue-200 font-semibold">| {exchangeConfig.code}</span>
            </span>
          </Link>

          <div className="flex-1 max-w-2xl mx-auto df-header-search min-w-0">
            <GlobalSearch />
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {marketBuddyButton}
            {asiToggleButton}
          </div>
        </div>

        <nav className="h-11 bg-[#F97316] px-4 lg:px-8 flex items-center gap-1 overflow-x-auto text-white text-[13px] whitespace-nowrap">
          {navItems.map((item) => {
            const active = isNavActive(item.path);
            const isHome = item.path === '/';
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-colors shrink-0 ${
                  active ? 'bg-white text-[#F97316] shadow-sm' : 'hover:bg-white/15'
                }`}
              >
                {isHome && <NavIcon name="home" className="w-3.5 h-3.5" active={active} />}
                {!isHome && item.label}
                {isHome && <span className="hidden sm:inline">Overview</span>}
                {isHome && <span className="sr-only sm:hidden">Overview</span>}
              </Link>
            );
          })}
        </nav>
      </header>

      <div className="flex min-h-[calc(100vh-7.75rem)]">
        {sidebarOpen && (
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden fixed inset-0 z-30 bg-slate-900/30"
            aria-label="Close sidebar overlay"
          />
        )}

        <aside
          className={`fixed lg:sticky top-[7.75rem] z-40 h-[calc(100vh-7.75rem)] w-[240px] shrink-0 bg-[#EEF2F7] border-r border-slate-200 transition-transform ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          }`}
        >
          <div className="h-full flex flex-col p-4 gap-1 overflow-y-auto">
            <div className="mb-2 px-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Navigate</p>
            </div>
            {navItems.map((item) => {
              const active = isNavActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                    active
                      ? 'bg-[#1E3A8A] text-white shadow-md'
                      : 'text-slate-600 hover:bg-white hover:text-slate-900'
                  }`}
                >
                  <NavIcon name={item.icon} className="w-4 h-4" active={active} />
                  {item.label}
                </Link>
              );
            })}
            <SidebarDisclaimer />
          </div>
        </aside>

        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="shrink-0 border-b border-slate-200/80 bg-white/90 backdrop-blur-md px-4 lg:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-base lg:text-lg font-semibold text-slate-900 tracking-tight truncate">
              {pageTitle}
            </h1>
            {dataUpdated && (
              <span className="text-[11px] font-medium text-slate-500 tabular-nums ml-auto">
                Updated {dataUpdated}
              </span>
            )}
          </div>

          <div data-app-scroll-root className="flex-1 overflow-auto p-4 lg:p-6">
            <div className="max-w-[1200px] mx-auto">
              {children}
              <SiteFooter />
            </div>
          </div>
        </main>
      </div>

      <RobotCursor />
      <AmmarCursorGuide />
      <AIGuidance />
      <PwaInstallBanner />
      <CookieConsent />
    </div>
  );
}
