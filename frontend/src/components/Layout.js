import { useState, useEffect, useTransition, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api';
import RobotCursor from './RobotCursor';
import AIGuidance from './AIGuidance';
import AmmarCursorGuide from './AmmarCursorGuide';
import ChallengersSideGuides from './ChallengersSideGuides';
import ChallengersWallpaper from './ChallengersWallpaper';
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
  { path: '/', label: 'Overview', short: 'Overview', icon: 'home', character: 'nav-overview.png', vibe: 'Captain Flow', group: 'primary' },
  { path: '/dividend-calendar', label: 'Dividend calendar', short: 'Dividends', icon: 'calendar', character: 'nav-dividends.png', vibe: 'Coin Catcher', group: 'primary' },
  { path: '/market-closing-prices', label: 'Market data', short: 'Market', icon: 'chart', character: 'nav-market.png', vibe: 'Chart Rider', group: 'primary' },
  { path: '/ipo-calendar', label: 'IPO calendar', short: 'IPOs', icon: 'ipo', character: 'nav-ipo.png', vibe: 'Launch Ace', group: 'primary' },
  { path: '/forecast-engine', label: 'Forecast', short: 'Forecast', icon: 'trend', character: 'nav-forecast.png', vibe: 'Signal Scout', group: 'primary' },
  { path: '/research-lab', label: 'Research Lab', short: 'Research', icon: 'document', character: 'nav-reporting.png', vibe: 'Study Star', group: 'primary' },
  { path: '/salary-simulator', label: 'Income planner', short: 'Income', icon: 'wallet', character: 'nav-income.png', vibe: 'AI Buddy', group: 'primary' },
  { path: '/reporting-cycles', label: 'Reporting cycles', short: 'Reporting', icon: 'document', character: 'nav-reporting.png', vibe: 'Study Star', group: 'more' },
  { path: '/market-brokers', label: 'Market brokers', short: 'Brokers', icon: 'broker', character: 'nav-brokers.png', vibe: 'Flag Flyer', group: 'more' },
  {
    path: NASDAQ_NEWSLETTER_URL,
    label: 'US stock enthusiasts',
    short: 'US stocks',
    icon: 'external',
    external: true,
    character: 'nav-us.png',
    vibe: 'Challenger',
    group: 'more',
  },
];

const primaryNav = navItems.filter((n) => n.group === 'primary');
const moreNav = navItems.filter((n) => n.group === 'more');

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
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);

  const aiToggleLoading = isAiTogglePending || aiToggleMinSpin;

  const marketBuddyButton = (
    <button
      type="button"
      onClick={toggleBuddy}
      aria-pressed={buddyOpen}
      aria-expanded={buddyOpen}
      aria-label={buddyOpen ? 'Close Market Buddy chat' : 'Open Market Buddy chat'}
      data-guide-hint="Market Buddy"
      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors shrink-0 ${
        buddyOpen
          ? 'text-[#1E3A8A] border-white bg-white shadow-sm'
          : 'text-white/95 border-white/25 bg-white/10 hover:bg-white/20'
      }`}
    >
      <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M4 5h16v11H8l-4 4z" strokeLinejoin="round" />
      </svg>
      <span className="hidden md:inline">Buddy</span>
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
      data-guide-hint="ASI assistant"
      disabled={aiToggleLoading}
      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors shrink-0 ${
        aiAssistanceOn
          ? 'text-[#1E3A8A] border-white bg-white shadow-sm'
          : 'text-white/95 border-white/25 bg-white/10 hover:bg-white/20'
      } ${aiToggleLoading ? 'opacity-70 cursor-wait' : ''}`}
    >
      {aiToggleLoading ? (
        <>
          <AiToggleSpinner className="w-3 h-3 animate-spin" />
          <span className="hidden md:inline">…</span>
        </>
      ) : (
        <>
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: aiAssistanceOn ? '#16a34a' : '#94a3b8' }} aria-hidden />
          <span className="hidden md:inline">{aiAssistanceOn ? 'ASI on' : 'ASI'}</span>
          <span className="md:hidden">ASI</span>
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
    setMoreOpen(false);
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

  useEffect(() => {
    if (!moreOpen) return undefined;
    const onDoc = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreOpen]);

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
  const moreActive = moreNav.some((item) => isNavActive(item.path, item.external));

  const renderNavLink = (item, { short = true, onNavigate } = {}) => {
    const active = isNavActive(item.path, item.external);
    const className = `group inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[13px] font-semibold transition-all shrink-0 ${
      active ? 'bg-white text-[#C2410C] shadow-sm' : 'text-white/95 hover:bg-white/15'
    }`;
    const inner = (
      <>
        <NavCharacter src={item.character} label={item.vibe} active={active} />
        <span>{short ? item.short : item.label}</span>
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
          title={`${item.vibe} · ${item.label}`}
          data-guide-hint={item.label}
          onClick={onNavigate}
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
        title={item.vibe}
        data-guide-hint={item.label}
        onClick={onNavigate}
      >
        {inner}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-transparent text-slate-800 font-sans relative isolate">
      <ChallengersWallpaper />
      <header className="sticky top-0 z-50 shadow-md shadow-slate-900/10">
        <div className="h-12 bg-[#1E3A8A] px-3 lg:px-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            className="lg:hidden text-white p-1.5 rounded-lg hover:bg-white/10"
            aria-label="Toggle menu"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <Link to="/" className="flex items-center gap-2 text-white shrink-0" title="DividendFlow PK home">
            <img src={LOGO} alt="" className="w-8 h-8 rounded-lg" aria-hidden />
            <span className="font-display font-bold text-sm tracking-tight hidden sm:inline">
              DividendFlow <span className="text-orange-300 font-semibold">{exchangeConfig.code}</span>
            </span>
          </Link>

          <div className="flex-1 max-w-md mx-auto df-header-search min-w-0">
            <GlobalSearch />
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {marketBuddyButton}
            {asiToggleButton}
          </div>
        </div>

        <nav
          className="hidden lg:flex h-11 bg-[#EA580C] px-3 lg:px-6 items-center gap-1 text-white"
          aria-label="Main"
        >
          <div className="flex items-center gap-0.5 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {primaryNav.map((item) => renderNavLink(item))}
            <div className="relative shrink-0" ref={moreRef}>
              <button
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                aria-expanded={moreOpen}
                aria-haspopup="menu"
                className={`group inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[13px] font-semibold transition-all ${
                  moreActive || moreOpen ? 'bg-white text-[#C2410C] shadow-sm' : 'text-white/95 hover:bg-white/15'
                }`}
              >
                More
                <svg className={`w-3.5 h-3.5 transition-transform ${moreOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              </button>
              {moreOpen && (
                <div
                  role="menu"
                  className="absolute left-0 top-[calc(100%+6px)] z-50 min-w-[220px] rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl shadow-slate-900/15"
                >
                  {moreNav.map((item) => {
                    const active = isNavActive(item.path, item.external);
                    const itemClass = `group flex w-full items-center gap-2.5 px-3 py-2.5 text-sm font-semibold transition-colors ${
                      active ? 'bg-orange-50 text-[#C2410C]' : 'text-slate-700 hover:bg-slate-50'
                    }`;
                    const body = (
                      <>
                        <NavCharacter src={item.character} label={item.vibe} active={active} />
                        <span className="text-left leading-tight">
                          {item.label}
                          <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            {item.vibe}
                          </span>
                        </span>
                      </>
                    );
                    if (item.external) {
                      return (
                        <a
                          key={item.path}
                          role="menuitem"
                          href={item.path}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={itemClass}
                          data-guide-hint={item.label}
                          onClick={() => setMoreOpen(false)}
                        >
                          {body}
                        </a>
                      );
                    }
                    return (
                      <Link
                        key={item.path}
                        role="menuitem"
                        to={item.path}
                        className={itemClass}
                        data-guide-hint={item.label}
                        onClick={() => setMoreOpen(false)}
                      >
                        {body}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {!isHome && (
            <div className="ml-auto pl-4 flex items-center gap-2 min-w-0 shrink">
              <h1 className="text-sm font-bold text-white truncate max-w-[10rem] xl:max-w-[14rem]">
                {pageTitle}
              </h1>
              {dataUpdated && (
                <span
                  className="hidden xl:inline text-[11px] font-medium text-white/80 tabular-nums truncate max-w-[18rem]"
                  title={`Updated ${dataUpdated}`}
                >
                  · Updated {dataUpdated}
                </span>
              )}
            </div>
          )}
        </nav>
      </header>

      <div className="relative z-10 flex min-h-[calc(100vh-3rem)] lg:min-h-[calc(100vh-5.75rem)]">
        {sidebarOpen && (
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden fixed inset-0 z-30 bg-slate-900/30"
            aria-label="Close sidebar overlay"
          />
        )}

        <aside
          className={`fixed lg:hidden top-12 z-40 h-[calc(100vh-3rem)] w-[260px] shrink-0 bg-[#1E3A8A] border-r border-blue-900 transition-transform ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="h-full flex flex-col p-4 gap-1 overflow-y-auto">
            {!isHome && (
              <div className="mb-3 px-1 pb-3 border-b border-blue-700/50">
                <p className="text-sm font-bold text-white">{pageTitle}</p>
                {dataUpdated && (
                  <p className="text-[10px] text-blue-200 mt-0.5 tabular-nums">Updated {dataUpdated}</p>
                )}
              </div>
            )}
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

        <main className="flex-1 min-w-0 flex flex-col overflow-hidden bg-transparent">
          <div
            data-app-scroll-root
            className={`flex-1 overflow-auto ${isHome ? '' : 'p-4 lg:p-6'}`}
          >
            <div className={isHome ? '' : 'max-w-[1200px] mx-auto'}>
              {!isHome && (
                <div className="lg:hidden mb-3 flex items-baseline justify-between gap-2">
                  <h1 className="text-lg font-bold text-slate-900 tracking-tight truncate">{pageTitle}</h1>
                  {dataUpdated && (
                    <span className="text-[10px] font-medium text-slate-500 tabular-nums shrink-0">
                      {dataUpdated}
                    </span>
                  )}
                </div>
              )}
              {children}
              <div className={isHome ? 'max-w-[1200px] mx-auto px-4 lg:px-6' : ''}>
                <SiteFooter />
              </div>
            </div>
          </div>
        </main>
      </div>

      <ChallengersSideGuides />
      <RobotCursor />
      <AmmarCursorGuide />
      <AIGuidance />
      <PwaInstallBanner />
      <CookieConsent />
    </div>
  );
}
