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
const THEME = `${process.env.PUBLIC_URL || ''}/theme/avatars`;

const NASDAQ_NEWSLETTER_URL = 'https://psxbluechips.com/nasdaq.html';

const navItems = [
  { path: '/', label: 'Overview', icon: 'home', character: 'nav-overview.png', vibe: 'Captain Flow' },
  { path: '/dividend-calendar', label: 'Dividend calendar', icon: 'calendar', character: 'nav-dividends.png', vibe: 'Coin Catcher' },
  { path: '/market-closing-prices', label: 'Market data', icon: 'chart', character: 'nav-market.png', vibe: 'Chart Rider' },
  { path: '/ipo-calendar', label: 'IPO calendar', icon: 'ipo', character: 'nav-ipo.png', vibe: 'Launch Ace' },
  { path: '/forecast-engine', label: 'Forecast', icon: 'trend', character: 'nav-forecast.png', vibe: 'Signal Scout' },
  { path: '/salary-simulator', label: 'Income planner', icon: 'wallet', character: 'nav-income.png', vibe: 'AI Buddy' },
  { path: '/reporting-cycles', label: 'Reporting cycles', icon: 'document', character: 'nav-reporting.png', vibe: 'Study Star' },
  { path: '/market-brokers', label: 'Market brokers', icon: 'broker', character: 'nav-brokers.png', vibe: 'Flag Flyer' },
  {
    path: NASDAQ_NEWSLETTER_URL,
    label: 'US stock enthusiasts',
    icon: 'external',
    external: true,
    character: 'nav-us.png',
    vibe: 'Challenger',
  },
];

function NavCharacter({ src, label, active = false, size = 'sm' }) {
  const dim = size === 'md' ? 'w-8 h-8' : 'w-6 h-6';
  return (
    <span
      className={`relative inline-flex ${dim} shrink-0 rounded-full overflow-hidden border-2 shadow-sm transition-transform ${
        active
          ? 'border-[#1E3A8A] scale-110 ring-2 ring-white/80'
          : 'border-white/80 group-hover:scale-105'
      }`}
      aria-hidden
    >
      <img
        src={`${THEME}/${src}`}
        alt=""
        className="w-full h-full object-cover object-top"
        loading="lazy"
        decoding="async"
      />
      <span className="sr-only">{label}</span>
    </span>
  );
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
    <p className="mt-auto pt-4 text-[10px] text-blue-200/70 leading-relaxed border-t border-blue-700/50">
      Educational only — not SECP-registered advice or buy/sell recommendations. Confirm figures with{' '}
      {exchangeConfig.code} and a licensed broker before trading.
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

  const isNavActive = (path, external = false) => {
    if (external) return false;
    if (path === '/') return location.pathname === '/';
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  const isHome = location.pathname === '/';

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
            <span className="font-display font-bold text-[15px] tracking-tight hidden sm:inline">
              DividendFlow PK <span className="text-orange-300 font-semibold">| {exchangeConfig.code}</span>
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

        <nav className="hidden lg:flex h-12 bg-[#F97316] px-4 lg:px-8 items-center gap-1 overflow-x-auto text-white text-[13px] whitespace-nowrap">
          {navItems.map((item) => {
            const active = isNavActive(item.path, item.external);
            const className = `group inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full font-semibold transition-all shrink-0 ${
              active ? 'bg-white text-[#F97316] shadow-sm' : 'hover:bg-white/15'
            }`;
            const inner = (
              <>
                <NavCharacter src={item.character} label={item.vibe} active={active} />
                <span>{item.label}</span>
              </>
            );
            if (item.external) {
              return (
                <a
                  key={item.path}
                  href={item.path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={className}
                  title={`${item.vibe} · DividendFlow's New Service`}
                >
                  {inner}
                </a>
              );
            }
            return (
              <Link key={item.path} to={item.path} className={className} title={item.vibe}>
                {inner}
              </Link>
            );
          })}
        </nav>
      </header>

      <div className="flex min-h-[calc(100vh-3.75rem)] lg:min-h-[calc(100vh-7.75rem)]">
        {sidebarOpen && (
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden fixed inset-0 z-30 bg-slate-900/30"
            aria-label="Close sidebar overlay"
          />
        )}

        <aside
          className={`fixed lg:hidden top-[3.75rem] z-40 h-[calc(100vh-3.75rem)] w-[240px] shrink-0 bg-[#1E3A8A] border-r border-blue-900 transition-transform ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="h-full flex flex-col p-4 gap-1 overflow-y-auto">
            <div className="mb-2 px-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-300">Navigate</p>
            </div>
            {navItems.map((item) => {
              const active = isNavActive(item.path, item.external);
              const className = `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                active
                  ? 'bg-[#3B82F6] text-white shadow-md'
                  : 'text-blue-100 hover:bg-white/10'
              }`;
              const inner = (
                <>
                  <NavCharacter src={item.character} label={item.vibe} active={active} size="md" />
                  <span className="leading-tight">
                    {item.label}
                    <span className={`block text-[10px] font-bold uppercase tracking-wide ${active ? 'text-orange-200' : 'text-blue-300'}`}>
                      {item.vibe}
                    </span>
                  </span>
                </>
              );
              if (item.external) {
                return (
                  <a
                    key={item.path}
                    href={item.path}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={className}
                    title={`${item.vibe} · DividendFlow's New Service`}
                    onClick={() => setSidebarOpen(false)}
                  >
                    {inner}
                  </a>
                );
              }
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={className}
                  onClick={() => setSidebarOpen(false)}
                >
                  {inner}
                </Link>
              );
            })}
            <SidebarDisclaimer />
          </div>
        </aside>

        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {!isHome && (
            <div className="shrink-0 border-b border-slate-200/80 bg-white px-4 lg:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-base lg:text-lg font-semibold text-slate-900 tracking-tight truncate">
                {pageTitle}
              </h1>
              {dataUpdated && (
                <span className="text-[11px] font-medium text-slate-500 tabular-nums ml-auto">
                  Updated {dataUpdated}
                </span>
              )}
            </div>
          )}

          <div
            data-app-scroll-root
            className={`flex-1 overflow-auto ${isHome ? '' : 'p-4 lg:p-6'}`}
          >
            <div className={isHome ? '' : 'max-w-[1200px] mx-auto'}>
              {children}
              <div className={isHome ? 'max-w-[1200px] mx-auto px-4 lg:px-6' : ''}>
                <SiteFooter />
              </div>
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
