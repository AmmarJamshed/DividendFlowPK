import { Link } from 'react-router-dom';
import { getPktDateString, MIN_PRICE_MOVE_PCT } from '../utils/dashboardRiskAlerts';

/**
 * Headline alerts paired with price moves — shown prominently on the dashboard.
 */
export default function DashboardNewsPanel({ riskAlerts, dailyNews, onSelectAlert }) {
  const headlineCount = (dailyNews?.news || []).length;

  return (
    <section
      className="section-zone section-zone--news p-5 sm:p-6 flex flex-col"
      aria-labelledby="dashboard-news-heading"
    >
      <span className="section-zone-tag">News &amp; headlines</span>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <div>
          <h3 id="dashboard-news-heading" className="card-header text-lg">
            News linked to price moves
          </h3>
          <p className="card-subtitle">
            We pair a real headline with a big same-day price swing (about {MIN_PRICE_MOVE_PCT}% or more). Macro news
            (rates, IMF) may appear beside a stock that moved sharply. <strong>Tap a card</strong> to read the story —
            informational only, not a trading signal.
          </p>
        </div>
        {headlineCount > 0 && (
          <span className="badge-pill bg-violet-50 text-violet-800 border-violet-200 shrink-0">
            {headlineCount} headline{headlineCount === 1 ? '' : 's'} in feed
          </span>
        )}
      </div>
      {(riskAlerts[0]?.rotationDate || dailyNews?.news?.length > 0 || dailyNews?.priceChanges?.length > 0) && (
        <p className="text-[11px] text-slate-500 mt-1">
          Pakistan time (PKT):{' '}
          <span className="font-medium text-slate-600">{riskAlerts[0]?.rotationDate || getPktDateString()}</span>
          <span className="block mt-0.5">Refreshed daily after market close.</span>
        </p>
      )}
      <ul className="mt-4 space-y-4 flex-1 max-h-[min(560px,70vh)] overflow-y-auto pr-1">
        {riskAlerts.length === 0 ? (
          <li className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-600">
            <p className="font-medium text-slate-700 mb-1">No qualifying alerts</p>
            <p className="mb-2">
              Nothing matched <strong>today</strong>: we look for a <strong>news headline</strong> plus a move of at
              least {MIN_PRICE_MOVE_PCT}% for that company (or a major market/policy story tied to a large decliner).
              Check back after the next session.
            </p>
            <p>
              <Link to="/market-closing-prices" className="btn-link">
                Market closing prices
              </Link>{' '}
              — see session moves for more tickers.
            </p>
          </li>
        ) : (
          riskAlerts.map((r, i) => {
            const levelStyles =
              r.level === 'Elevated'
                ? { badge: 'bg-rose-100 text-rose-800 border-rose-300', dot: 'bg-rose-500' }
                : r.level === 'Moderate'
                  ? { badge: 'bg-amber-100 text-amber-800 border-amber-300', dot: 'bg-amber-500' }
                  : { badge: 'bg-sky-100 text-sky-800 border-sky-300', dot: 'bg-sky-500' };
            return (
              <li key={`${r.company}-${i}`}>
                <div
                  role="button"
                  tabIndex={0}
                  className="w-full text-left p-4 rounded-xl bg-white border border-slate-200 cursor-pointer transition-all hover:border-teal-300 hover:bg-teal-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
                  onClick={() => onSelectAlert(r)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectAlert(r);
                    }
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${levelStyles.dot}`} aria-hidden />
                      <span className="font-semibold text-slate-800">{r.company}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-lg border font-bold ${levelStyles.badge}`}>
                        {r.level}
                      </span>
                      {r.kind === 'news' && (
                        <span className="text-[10px] uppercase tracking-wide text-teal-700 font-semibold">
                          News + move
                        </span>
                      )}
                      {r.kind === 'macro_link' && (
                        <span className="text-[10px] uppercase tracking-wide text-violet-700 font-semibold">
                          Macro / PSX
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-teal-600 shrink-0">
                      Details →
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-800 leading-snug line-clamp-2">{r.headline}</p>
                  {typeof r.priceMovePct === 'number' && r.priceMovePct !== 0 && (
                    <p className="mt-1.5 text-xs font-semibold text-slate-700">
                      Session vs prior:{' '}
                      <span className={r.priceMovePct < 0 ? 'text-rose-600' : 'text-emerald-600'}>
                        {r.priceMovePct > 0 ? '+' : ''}
                        {r.priceMovePct.toFixed(2)}%
                      </span>
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
                    <span className="text-slate-500">Source:</span>
                    {r.url ? (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-teal-600 font-medium hover:underline break-all"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {r.source}
                      </a>
                    ) : (
                      <span className="font-medium">{r.source}</span>
                    )}
                    {r.newsDate && <span className="text-slate-400">· {String(r.newsDate).slice(0, 16)}</span>}
                  </div>
                  <div className="mt-3 pt-3 border-t border-amber-200/90">
                    <p className="text-[10px] uppercase tracking-wide text-amber-800/80 font-semibold mb-1">
                      AI summary (preview)
                    </p>
                    <p className="text-sm text-slate-600 leading-relaxed line-clamp-2">{r.message}</p>
                  </div>
                </div>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}
