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

const AMMAR_AVATAR = `${process.env.PUBLIC_URL || ''}/ammar-guide.png`;

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
    <div className="space-y-4">
      <section className="df-hero-card">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
          <div className="flex-1 min-w-0">
            <span className="df-tag">Daily Missions · Pakistan (PSX)</span>
            <h2 className="text-2xl lg:text-[28px] font-extrabold text-slate-900 mt-3 leading-tight tracking-tight">
              Your dividend &amp; market snaps
            </h2>
            <p className="text-sm text-slate-600 mt-3 leading-relaxed max-w-2xl">
              Track payout calendars, closing prices, and headline-linked moves from archived PSX data.
              Updated on weekdays after the session — for research only, not investment advice.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link to="/market-closing-prices" className="df-btn-primary">
                View market data
              </Link>
              <Link to="/dividend-calendar" className="df-btn-outline">
                Dividend calendar
              </Link>
            </div>
          </div>

          <div className="flex items-start gap-3 shrink-0 lg:max-w-[280px]">
            <img
              src={AMMAR_AVATAR}
              alt="Ammar guide"
              className="w-14 h-14 rounded-full border-2 border-[#1E3A8A] object-cover shadow-md bg-white"
            />
            <div className="relative bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-3.5 py-2.5 shadow-sm text-xs text-slate-600 leading-relaxed">
              <p className="font-bold text-[#1E3A8A] text-[11px] uppercase tracking-wide mb-1">Ammar</p>
              Taking a look at what you&apos;re hovering over…
            </div>
          </div>
        </div>
      </section>

      <section className="df-card flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-5">
        <div className="flex-1 min-w-0">
          <p className="text-sm sm:text-base font-semibold text-slate-800 leading-snug">
            If you wish to know how much dividends you&apos;ll get this time,{' '}
            <Link to="/dividend-calendar#dividend-calculator" className="text-[#1E3A8A] underline font-bold">
              please click here
            </Link>
            .
          </p>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            Opens the dividend calculator — enter your symbols and share counts to estimate cash by month.
          </p>
        </div>
        <Link
          to="/dividend-calendar#dividend-calculator"
          className="shrink-0 inline-flex items-center justify-center rounded-xl bg-[#F97316] text-white px-5 py-2.5 text-sm font-bold hover:bg-orange-500 shadow-sm"
        >
          View Dividend History
        </Link>
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">News linked to price moves</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Real headlines paired with a session move of about {MIN_PRICE_MOVE_PCT}% or more on{' '}
              {exchangeConfig.code}. Macro stories show the linked mover ticker.
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
                        <span className="text-[10px] uppercase tracking-wide text-violet-700 font-bold">
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
                          {pct !== 0
                            ? `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`
                            : ''}
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
