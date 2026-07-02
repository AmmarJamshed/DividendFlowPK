import { Link } from 'react-router-dom';

const AMMAR_AVATAR = `${process.env.PUBLIC_URL || ''}/ammar-guide.png`;

const newsCards = [
  {
    source: 'DAWN Business',
    sourceShort: 'D',
    headline: 'AI Summary: Shown a macro-wide headline with mixed sector impact across PSX leaders.',
    ticker: null,
    change: null,
    points: [72, 68, 61, 55, 48, 42, 38],
    trend: 'down',
  },
  {
    source: 'News Articles',
    sourceShort: 'D',
    headline: 'Pakistan made meaningful progress in fiscal federation reforms remain: WB',
    ticker: 'KOHTM',
    change: '-6.40%',
    changeExtra: '-07.01',
    points: [30, 35, 33, 40, 48, 52, 58],
    trend: 'up',
  },
];

function Sparkline({ points, trend }) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const spread = Math.max(max - min, 1);
  const poly = points
    .map((p, i) => `${(i / (points.length - 1)) * 100},${100 - ((p - min) / spread) * 100}`)
    .join(' ');
  const stroke = trend === 'down' ? '#DC2626' : '#16A34A';
  const fill = trend === 'down' ? 'rgba(220,38,38,0.12)' : 'rgba(22,163,74,0.12)';
  return (
    <svg viewBox="0 0 100 40" className="w-28 h-10 shrink-0">
      <polygon fill={fill} points={`0,100 ${poly} 100,100`} />
      <polyline fill="none" stroke={stroke} strokeWidth="2.5" points={poly} />
    </svg>
  );
}

export default function DashboardRedesign() {
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
        <h2 className="text-lg font-bold text-slate-900 mb-3">News linked to price moves</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {newsCards.map((card) => (
            <article key={card.headline} className="df-card p-4 flex gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-md bg-[#1E3A8A] text-white text-xs font-bold flex items-center justify-center shrink-0">
                    {card.sourceShort}
                  </div>
                  <span className="text-xs font-semibold text-slate-600">{card.source}</span>
                  {card.ticker && (
                    <span className="ml-auto text-xs font-bold text-red-600 tabular-nums">
                      {card.ticker} {card.change} {card.changeExtra}
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-800 leading-snug font-medium">{card.headline}</p>
              </div>
              <Sparkline points={card.points} trend={card.trend} />
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
