import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import GlobalSearch from './GlobalSearch';
import SiteFooter from './SiteFooter';

const LOGO = `${process.env.PUBLIC_URL || ''}/dividendflow-logo.png`;

const topNavItems = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/dividend-calendar', label: 'My Portfolio' },
  { to: '/dividend-calendar', label: 'Dividend Calendar' },
  { to: '/market-closing-prices', label: 'Top Yielders' },
  { to: '/forecast-engine', label: 'Growth Stocks' },
  { to: '/salary-simulator', label: 'Tax Calculator' },
  { to: '/account', label: 'Profile' },
];

const sidebarItems = [
  { to: '/dividend-calendar', label: 'Sector Focus', sub: 'high yield', icon: 'pie' },
  { to: '/forecast-engine', label: 'Watchlist', sub: 'growth', icon: 'star' },
];

function NavIcon({ name, className = 'w-4 h-4' }) {
  const cls = className;
  switch (name) {
    case 'home':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M6 10v10h12V10" />
        </svg>
      );
    case 'grid':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case 'pie':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M12 3v9h9a9 9 0 1 0-9-9z" />
        </svg>
      );
    case 'star':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="m12 2 3.1 6.3L22 9.3l-5 4.9 1.2 6.9L12 17.8 5.8 21.1 7 14.2l-5-4.9 6.9-1z" />
        </svg>
      );
    case 'calc':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M8 7h8M8 11h2M14 11h2M8 15h2M14 15h2" />
        </svg>
      );
    case 'settings':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
        </svg>
      );
    default:
      return null;
  }
}

export default function Layout({ children }) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isNavActive = (to) => {
    if (to === '/') return location.pathname === '/';
    return location.pathname === to || location.pathname.startsWith(`${to}/`);
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
              DIVIDEND FLOW PK <span className="text-blue-200 font-semibold">| PSX</span>
            </span>
          </Link>

          <div className="flex-1 max-w-2xl mx-auto df-header-search">
            <GlobalSearch />
          </div>

          <div className="hidden md:flex items-center gap-3 text-white shrink-0">
            <svg className="w-4 h-4 text-blue-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            <span className="text-sm font-medium">Fatima Zahra</span>
            <div className="relative">
              <svg className="w-5 h-5 text-blue-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5m6 0v1a3 3 0 1 1-6 0v-1" />
              </svg>
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-[10px] font-bold flex items-center justify-center">1</span>
            </div>
            <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-blue-200 bg-blue-100 text-blue-900 font-bold flex items-center justify-center text-xs">
              FZ
            </div>
            <svg className="w-4 h-4 text-blue-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </div>

        <nav className="h-11 bg-[#F97316] px-4 lg:px-8 flex items-center gap-1 overflow-x-auto text-white text-[13px] whitespace-nowrap">
          {topNavItems.map((item) => {
            const active = isNavActive(item.to) && (item.icon !== 'home' || location.pathname === '/');
            const homeActive = item.icon === 'home' && location.pathname === '/';
            return (
              <Link
                key={item.label}
                to={item.to}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-colors ${
                  homeActive || (active && item.icon !== 'home')
                    ? 'bg-white text-[#F97316] shadow-sm'
                    : 'hover:bg-white/15'
                }`}
              >
                {item.icon === 'home' && <NavIcon name="home" className="w-3.5 h-3.5" />}
                {item.icon !== 'home' && item.label}
                {item.icon === 'home' && <span className="sr-only">Home</span>}
              </Link>
            );
          })}
        </nav>
      </header>

      <div className="flex min-h-[calc(100vh-4.5rem)]">
        {sidebarOpen && (
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden fixed inset-0 z-30 bg-slate-900/30"
            aria-label="Close sidebar overlay"
          />
        )}

        <aside
          className={`fixed lg:sticky top-[4.5rem] lg:top-0 z-40 h-[calc(100vh-4.5rem)] lg:h-[calc(100vh-4.5rem)] w-[240px] shrink-0 bg-[#EEF2F7] border-r border-slate-200 transition-transform ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          }`}
        >
          <div className="h-full flex flex-col p-4 gap-1">
            <Link
              to="/dividend-calendar"
              className="flex items-center gap-3 rounded-xl bg-[#1E3A8A] text-white px-3 py-2.5 text-sm font-semibold shadow-md"
            >
              <NavIcon name="grid" className="w-4 h-4" />
              My Portfolios
            </Link>

            {sidebarItems.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-600 hover:bg-white hover:text-slate-900"
              >
                <NavIcon name={item.icon} className="w-4 h-4 text-slate-400" />
                <span>
                  {item.label}{' '}
                  <span className="text-xs text-slate-400">({item.sub})</span>
                </span>
              </Link>
            ))}

            <Link
              to="/salary-simulator"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-600 hover:bg-white hover:text-slate-900 mt-2"
            >
              <NavIcon name="calc" className="w-4 h-4 text-slate-400" />
              Calculator
            </Link>
            <Link
              to="/reporting-cycles"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-600 hover:bg-white hover:text-slate-900"
            >
              <NavIcon name="settings" className="w-4 h-4 text-slate-400" />
              Settings
            </Link>

            <div className="mt-auto pt-4">
              <Link
                to="/dividend-calendar"
                className="block w-full rounded-xl bg-[#F97316] text-white text-center py-2.5 text-sm font-bold hover:bg-orange-500 shadow-sm"
              >
                Explore Payout Calendar
              </Link>
            </div>
          </div>
        </aside>

        <main className="flex-1 min-w-0 p-4 lg:p-6 overflow-x-hidden">
          <div className="max-w-[1200px] mx-auto">
            {children}
            <SiteFooter />
          </div>
        </main>
      </div>
    </div>
  );
}
