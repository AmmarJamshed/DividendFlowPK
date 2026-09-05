import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useExchange } from '../context/ExchangeContext';
import { stockPath } from '../config/exchanges';
import {
  buildDashboardRiskAlerts,
  getPktDateString,
  MIN_PRICE_MOVE_PCT,
} from '../utils/dashboardRiskAlerts';
import CompanyLogo from '../components/CompanyLogo';
import ThemeOpening from '../components/ThemeOpening';

const PUBLIC = process.env.PUBLIC_URL || '';

const NASDAQ_NEWSLETTER_URL = 'https://psxbluechips.com/nasdaq.html';

const QUICK_LINKS = [
  { to: '/dividend-calendar', label: 'Dividend calendar', hint: 'Payouts & calculator' },
  { to: '/market-closing-prices', label: 'Market data', hint: 'Session closes' },
  { to: '/ipo-calendar', label: 'IPO calendar', hint: 'Upcoming listings' },
  { to: '/forecast-engine', label: 'Forecast', hint: 'Scenario tools' },
  {
    to: NASDAQ_NEWSLETTER_URL,
    label: 'US stock enthusiasts',
    hint: "DividendFlow's New Service",
    external: true,
  },
];

function Sparkline({ points, trend }) {
  if (!points?.length) return null;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const spread = Math.max(max - min, 1);
  const poly = points
    .map((p, i) => `${(i / (points.length - 1)) * 100},${100 - ((p - min) / spread) * 100}`)
    .join(' ');
  const stroke = trend === 'down' ? '#DC2626' : '#16A34A';
  const fill = trend === 'down' ? 'rgba(220,38,38,0.12)' : 'rgba(22,163,74,0.12)';
  return (
    <svg viewBox="0 0 100 40" className="w-28 h-10 shrink-0" aria-hidden>
      <polygon fill={fill} points={`0,100 ${poly} 100,100`} />
      <polyline fill="none" stroke={stroke} strokeWidth="2.5" points={poly} />
    </svg>
  );
}

function sparkPointsFromMove(pct) {
  const base = 50;
  const end = Math.max(5, Math.min(95, base + (pct || 0) * 4));
  const steps = 7;
  return Array.from({ length: steps }, (_, i) => {
    const t = i / (steps - 1);
    return base + (end - base) * t + Math.sin(i * 1.2) * 3;
  });
}

function sourceInitial(source) {
  const s = String(source || 'N').trim();
  return (s[0] || 'N').toUpperCase();
}

export default function DashboardRedesign() {
  const { exchange, exchangeConfig } = useExchange();
  const [riskAlerts, setRiskAlerts] = useState([]);
  const [tradeDate, setTradeDate] = useState(null);
  const [headlineCount, setHeadlineCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getExchangeDailyNews(exchange)
      .then((res) => {
        if (cancelled) return;
        const payload = res.data || {};
        setHeadlineCount((payload.news || []).length);
        setTradeDate(payload.tradeDate || payload.priceChanges?.[0]?.Date || null);
        setRiskAlerts(
          buildDashboardRiskAlerts(payload, {
            maxAlerts: 6,
            dateKey: getPktDateString(),
            exchange,
          })
        );
      })
      .catch(() => {
        if (!cancelled) {
          setRiskAlerts([]);
          setHeadlineCount(0);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [exchange]);

  return (
    <div className="df-home">
      <section className="df-cinematic-hero" aria-label="DividendFlow PK">
        <div
          className="df-cinematic-hero__bg"
          style={{ backgroundImage: `url(${PUBLIC}/theme/dfpk-theme-02-race.png)` }}
        />
        <div className="df-cinematic-hero__shade" />
        <div className="df-cinematic-hero__inner">
          <p className="df-cinematic-hero__brand">DividendFlow PK</p>
          <h1 className="df-cinematic-hero__title">Gotta Track &apos;Em All</h1>
          <p className="df-cinematic-hero__lede">
            PSX dividends, closes, and IPOs — research tools for Pakistan&apos;s market.
          </p>
          <div className="df-cinematic-hero__cta">
            <Link to="/market-closing-prices" className="df-btn-primary df-btn-hero">
              Open market data
            </Link>
            <a href="#theme-song" className="df-btn-ghost">
              Play theme song
            </a>
          </div>
        </div>
      </section>

      <div id="theme-song">
        <ThemeOpening />
      </div>

      <section className="max-w-[1200px] mx-auto px-4 lg:px-6 pb-4">
        <div className="df-tools-row">
          {QUICK_LINKS.map((item) =>
            item.external ? (
              <a
                key={item.to}
                href={item.to}
                target="_blank"
                rel="noopener noreferrer"
                className="df-tool-link"
              >
                <span className="df-tool-link__label">{item.label}</span>
                <span className="df-tool-link__hint">{item.hint}</span>
              </a>
            ) : (
              <Link key={item.to} to={item.to} className="df-tool-link">
                <span className="df-tool-link__label">{item.label}</span>
                <span className="df-tool-link__hint">{item.hint}</span>
              </Link>
            )
          )}
        </div>
      </section>

      <section className="max-w-[1200px] mx-auto px-4 lg:px-6 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl bg-[#1E3A8A] px-5 py-4 text-white">
          <p className="text-sm font-semibold leading-snug">
            Estimate this period&apos;s dividends with your share counts.
          </p>
          <Link
            to="/dividend-calendar#dividend-calculator"
            className="shrink-0 inline-flex items-center justify-center rounded-xl bg-[#F97316] px-5 py-2.5 text-sm font-bold hover:bg-orange-500 transition-colors"
          >
            Dividend calculator
          </Link>
        </div>
      </section>

      <section className="max-w-[1200px] mx-auto px-4 lg:px-6 pb-12">
        <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">News linked to price moves</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Headlines paired with a session move on {exchangeConfig.code}. Research only — not advice.
            </p>
          </div>
          {(headlineCount > 0 || tradeDate) && (
            <span className="text-[11px] font-semibold text-slate-500">
              {exchange} · {headlineCount} headline{headlineCount === 1 ? '' : 's'}
              {tradeDate ? ` · close ${tradeDate}` : ''}
            </span>
          )}
        </div>

        {loading ? (
          <div className="df-card p-8 flex justify-center">
            <div className="w-8 h-8 border-2 border-[#1E3A8A] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : riskAlerts.length === 0 ? (
          <div className="df-card p-5 text-sm text-slate-600">
            <p className="font-semibold text-slate-800 mb-1">No qualifying alerts yet</p>
            <p>
              We need a headline plus a move of at least {MIN_PRICE_MOVE_PCT}% for that symbol (or a macro
              story tied to a large mover). Check back after the next {exchangeConfig.name} session.
            </p>
            <Link to="/market-closing-prices" className="df-btn-primary mt-4 inline-flex">
              View market data
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {riskAlerts.map((alert) => {
              const pct = typeof alert.priceMovePct === 'number' ? alert.priceMovePct : 0;
              const trend = pct < 0 ? 'down' : 'up';
              const ticker = alert.company;
              return (
                <article key={`${ticker}-${alert.headline}`} className="df-card p-4 flex gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      {ticker ? (
                        <CompanyLogo symbol={ticker} className="w-7 h-7" />
                      ) : (
                        <div className="w-7 h-7 rounded-md bg-[#1E3A8A] text-white text-xs font-bold flex items-center justify-center shrink-0">
                          {sourceInitial(alert.source)}
                        </div>
                      )}
                      <span className="text-xs font-semibold text-slate-600 truncate">
                        {alert.source || 'News'}
                      </span>
                      {alert.kind === 'macro_link' && (
                        <span className="text-[10px] uppercase tracking-wide text-orange-700 font-bold">
                          Macro
                        </span>
                      )}
                      {ticker && (
                        <Link
                          to={stockPath(exchange, ticker)}
                          className={`ml-auto text-xs font-bold tabular-nums shrink-0 ${
                            pct < 0 ? 'text-red-600' : 'text-emerald-600'
                          }`}
                        >
                          {ticker}{' '}
                          {pct !== 0 ? `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%` : ''}
                        </Link>
                      )}
                    </div>
                    <p className="text-sm text-slate-800 leading-snug font-medium line-clamp-3">
                      {alert.headline}
                    </p>
                    {alert.message && (
                      <p className="text-xs text-slate-500 mt-2 line-clamp-2 leading-relaxed">
                        {alert.message}
                      </p>
                    )}
                  </div>
                  <Sparkline points={sparkPointsFromMove(pct)} trend={trend} />
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
