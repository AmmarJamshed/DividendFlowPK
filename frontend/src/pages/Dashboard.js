import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { api } from '../api';
import Disclaimer from '../components/Disclaimer';
import DashboardMarketChat from '../components/DashboardMarketChat';
import PageHero from '../components/ui/PageHero';
import MetricCard from '../components/ui/MetricCard';
import HelpTip from '../components/ui/HelpTip';
import DividendCalculatorCta from '../components/DividendCalculatorCta';
import QuickActionGrid from '../components/ui/QuickActionGrid';
import DashboardNewsPanel from '../components/DashboardNewsPanel';
import { useExchange } from '../context/ExchangeContext';
import { stockPath } from '../config/exchanges';
import { formatMoney } from '../utils/formatMoney';
import {
  normalizeDividendRows,
  buildMonthCoverageFromDividends,
} from '../utils/exchangeDashboard';
import { buildDashboardRiskAlerts, getPktDateString } from '../utils/dashboardRiskAlerts';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

/** One row per company (highest yield), then top 5 — must match list shown in UI so risk API is called for the same symbols. */
function getTopYieldRows(dividends) {
  const byCompany = new Map();
  (dividends || []).forEach(d => {
    const c = (d.Company || d.company || '').trim();
    const y = parseFloat(d.Dividend_yield || d.dividend_yield) || 0;
    const existing = byCompany.get(c);
    if (!existing || (parseFloat(existing.Dividend_yield || existing.dividend_yield) || 0) < y) byCompany.set(c, d);
  });
  return [...byCompany.values()]
    .sort((a, b) => (parseFloat(b.Dividend_yield || b.dividend_yield) || 0) - (parseFloat(a.Dividend_yield || a.dividend_yield) || 0))
    .slice(0, 5);
}

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    title: {
      display: true,
      text: 'How many companies typically pay dividends each month',
      color: '#334155',
      font: { size: 12, weight: '600' },
      padding: { bottom: 12 },
    },
    tooltip: {
      callbacks: {
        label: (ctx) => ` ${ctx.parsed.y} companies with payouts`,
      },
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      title: { display: true, text: 'Number of companies', color: '#64748b', font: { size: 11 } },
      grid: { color: 'rgba(148, 163, 184, 0.25)' },
      ticks: { color: '#64748b', stepSize: 1 },
    },
    x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 11 } } },
  },
};

export default function Dashboard() {
  const { exchange, exchangeConfig } = useExchange();
  const isPsx = exchange === 'PSX';
  const [dividends, setDividends] = useState([]);
  const [monthCoverage, setMonthCoverage] = useState(null);
  const [riskAlerts, setRiskAlerts] = useState([]);
  const [tradeDate, setTradeDate] = useState(null);
  const [dailyNews, setDailyNews] = useState({
    news: [],
    commentary: [],
    priceChanges: [],
    priceCommentary: [],
  });
  const [marketMeta, setMarketMeta] = useState({ symbolsTracked: 0, source: null });
  const [dividendPreview, setDividendPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  /** Full headline + AI text for a selected alert */
  const [alertDetailOpen, setAlertDetailOpen] = useState(null);

  const closeAlertDetail = useCallback(() => setAlertDetailOpen(null), []);

  useEffect(() => {
    if (!alertDetailOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') closeAlertDetail();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [alertDetailOpen, closeAlertDetail]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [divRes, covRes, newsRes, pricesRes] = await Promise.all([
          (isPsx ? api.getDividends() : api.getMarketDividends(exchange)).catch((err) => {
            console.warn('Dividends load failed:', err);
            return { data: isPsx ? [] : { rows: [] } };
          }),
          isPsx ? api.getMonthCoverage() : Promise.resolve({ data: null }),
          api.getExchangeDailyNews(exchange).catch(() => ({ data: {} })),
          !isPsx
            ? api.getMarketClosingPrices(exchange).catch(() => ({ data: null }))
            : Promise.resolve({ data: null }),
        ]);
        if (cancelled) return;

        if (isPsx) {
          setDividends(divRes.data);
          setMonthCoverage(covRes.data);
        } else {
          const normalized = normalizeDividendRows(divRes.data?.rows || [], exchange);
          setDividends(normalized);
          setDividendPreview(Boolean(divRes.data?.preview));
          const apiSummary = divRes.data?.summary;
          if (apiSummary?.uniquePayers != null) {
            setMonthCoverage({
              monthCoverage: buildMonthCoverageFromDividends(normalized).monthCoverage,
              dividendSummary: apiSummary,
            });
          } else {
            setMonthCoverage(buildMonthCoverageFromDividends(normalized));
          }
          const pricePayload = pricesRes?.data;
          const tracked =
            pricePayload?.summary?.totalCompanies ??
            pricePayload?.meta?.withPrices ??
            (pricePayload?.rows || []).filter((r) => r.close != null && r.close > 0).length;
          setMarketMeta({
            symbolsTracked: tracked,
            source: pricePayload?.source || pricePayload?.meta?.source || null,
          });
        }

        const newsPayload = newsRes.data || {};
        setDailyNews(newsPayload);
        setTradeDate(newsPayload.tradeDate || newsPayload.priceChanges?.[0]?.Date || null);
        setRiskAlerts(
          buildDashboardRiskAlerts(newsPayload, {
            maxAlerts: 6,
            dateKey: getPktDateString(),
            exchange,
          })
        );
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [exchange, isPsx]);

  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const heatmapData = monthCoverage ? monthNames.map((m, i) => ({
    month: m,
    count: monthCoverage.monthCoverage?.[i + 1]?.count || 0
  })) : [];

  const topYield = getTopYieldRows(dividends);

  const dashboardStats = useMemo(() => {
    const companies = new Set();
    (dividends || []).forEach((d) => {
      const c = (d.Company || d.company || '').trim();
      if (c) companies.add(c);
    });
    const uniquePayers = monthCoverage?.dividendSummary?.uniquePayers ?? companies.size;
    const hasDividendCalendar = uniquePayers > 0;
    let busiestMonth = '—';
    let busiestCount = 0;
    if (monthCoverage?.dividendSummary?.busiestMonth) {
      busiestCount = monthCoverage.dividendSummary.busiestCount || 0;
      busiestMonth = monthNames[monthCoverage.dividendSummary.busiestMonth - 1] || '—';
    } else if (monthCoverage?.monthCoverage) {
      for (let i = 1; i <= 12; i++) {
        const c = monthCoverage.monthCoverage[i]?.count || 0;
        if (c > busiestCount) {
          busiestCount = c;
          busiestMonth = monthNames[i - 1];
        }
      }
    }
    const movers = (dailyNews.priceChanges || []).filter(
      (p) => Math.abs(parseFloat(p.ChangePct || p.changePct) || 0) >= 0.5
    ).length;
    const headlines = (dailyNews.news || []).length;
    return {
      companies: uniquePayers,
      hasDividendCalendar,
      symbolsTracked: marketMeta.symbolsTracked,
      dividendPreview,
      busiestMonth,
      busiestCount,
      movers,
      headlines,
      alerts: riskAlerts.length,
    };
  }, [dividends, monthCoverage, dailyNews, riskAlerts, marketMeta, dividendPreview]);

  const quickActions = [
    { to: '/market-closing-prices', icon: 'chart', label: `${exchangeConfig.code} market data`, hint: 'Session moves and volume', xp: 10 },
    { to: '/dividend-calendar#dividend-calculator', icon: 'calc', label: 'Dividend income calculator', hint: isPsx ? 'Holdings or portfolio PDF' : `${exchangeConfig.currency} holdings`, xp: 25 },
    {
      to: isPsx ? '/salary-simulator' : '/dividend-calendar#dividend-calculator',
      icon: 'wallet',
      label: isPsx ? 'Income replacement model' : 'Income planning',
      hint: isPsx ? 'Salary vs dividend yield' : `${exchangeConfig.currency} dividend targets`,
      xp: 15,
    },
    { to: '/#market-chat', icon: 'chat', label: 'Market Buddy', hint: 'PSX research Q&A', xp: 20 },
  ];

  const missionProgress = useMemo(() => {
    let done = 0;
    const marketCoverage = dashboardStats.hasDividendCalendar || dashboardStats.symbolsTracked > 0;
    if (marketCoverage) done += 1;
    if (dashboardStats.movers > 0) done += 1;
    if (dashboardStats.headlines > 0) done += 1;
    if (dashboardStats.alerts > 0) done += 1;
    return { done, total: 4, pct: Math.round((done / 4) * 100) };
  }, [dashboardStats]);

  const missionLevel =
    missionProgress.pct >= 100
      ? 'Market Pro'
      : missionProgress.pct >= 75
        ? 'Dividend Explorer'
        : missionProgress.pct >= 50
          ? 'Learner'
          : 'Rookie';
  const earnedXp = missionProgress.done * 25;

  const chartData = {
    labels: heatmapData.map(d => d.month),
    datasets: [{
      label: 'Dividend-paying companies',
      data: heatmapData.map(d => d.count),
      backgroundColor: 'rgba(13, 148, 136, 0.75)',
      borderColor: '#0a0e14',
      borderWidth: 0,
      borderRadius: 8,
    }]
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-ice-200 border-t-ice-500 rounded-full animate-spin" />
          <p className="text-slate-500 text-sm">Loading {exchangeConfig.name} data…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <PageHero
        eyebrow={`Daily missions · ${exchangeConfig.name}`}
        title="Your dividend & market snapshot"
        description={
          isPsx
            ? 'Track payout calendars, closing prices, and headline-linked moves from archived PSX data. Updated on weekdays after the session — for research only, not investment advice.'
            : `Track ${exchangeConfig.code} dividend profiles and closing prices from DividendFlow's cloud database (${exchangeConfig.currency}). Updated after each market close — research only, not investment advice.`
        }
      >
        <Link to="/market-closing-prices" className="btn-primary">
          View market data
        </Link>
        <Link to="/dividend-calendar" className="btn-ghost">
          Dividend calendar
        </Link>
      </PageHero>

      <DividendCalculatorCta />

      <DashboardNewsPanel
        riskAlerts={riskAlerts}
        dailyNews={dailyNews}
        exchange={exchange}
        exchangeConfig={exchangeConfig}
        tradeDate={tradeDate}
        onSelectAlert={setAlertDetailOpen}
      />

      <section className="section-zone section-zone--mission p-5 sm:p-6">
        <span className="section-zone-tag">Daily missions</span>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Mission progress</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Complete checks below to level up · <span className="font-semibold text-violet-700">+{earnedXp} XP earned</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="level-pill">{missionLevel}</span>
            <span className="badge-pill bg-ice-50 text-ink border-ice-200">
              {missionProgress.done}/{missionProgress.total} complete
            </span>
          </div>
        </div>
        <div className="xp-track">
          <div className="xp-fill" style={{ width: `${missionProgress.pct}%` }} />
        </div>
        <p className="text-[10px] font-semibold text-slate-500 mt-2 tabular-nums">{missionProgress.pct}% to next rank</p>
      </section>

      <section className="section-zone section-zone--snapshot">
        <span className="section-zone-tag">Market snapshot</span>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            label={dashboardStats.hasDividendCalendar ? 'Dividend payers' : 'Symbols tracked'}
            value={dashboardStats.hasDividendCalendar ? dashboardStats.companies : dashboardStats.symbolsTracked}
            hint={
              dashboardStats.hasDividendCalendar
                ? dashboardStats.dividendPreview
                  ? 'Yahoo Finance preview · leaders'
                  : 'Unique names in payout calendar'
                : marketMeta.source === 'yahoo_seeds'
                  ? 'Latest closes via Yahoo seeds'
                  : 'Latest closes in database'
            }
            tip={
              dashboardStats.hasDividendCalendar
                ? `How many different ${exchangeConfig.code} symbols have dividend data${dashboardStats.dividendPreview ? ' (preview from market leaders until quarterly sync)' : ''}.`
                : `How many ${exchangeConfig.code} symbols have a saved close in our database.`
            }
            accent="brand"
          />
          <MetricCard
            label="Peak payout month"
            value={dashboardStats.hasDividendCalendar ? dashboardStats.busiestMonth : '—'}
            hint={
              dashboardStats.hasDividendCalendar && dashboardStats.busiestCount
                ? `${dashboardStats.busiestCount} companies with payouts`
                : dashboardStats.hasDividendCalendar
                  ? 'Calendar dataset'
                  : 'Dividend sync pending'
            }
            tip={
              dashboardStats.hasDividendCalendar
                ? 'The calendar month when the most companies pay dividends — useful for planning cash flow.'
                : `Full ${exchangeConfig.code} dividend calendar syncs quarterly. Preview uses leader symbols when available.`
            }
            accent="violet"
          />
          <MetricCard
            label="Notable movers"
            value={dashboardStats.movers}
            hint="Stocks with large session change"
            tip={`Count of ${exchangeConfig.code} symbols with a large up or down move in the latest saved close.`}
            accent="emerald"
          />
          <MetricCard
            label="News items"
            value={dashboardStats.headlines}
            hint={`${dashboardStats.alerts} linked alerts`}
            tip={`Headlines paired with price moves for ${exchangeConfig.code} (database + Yahoo Finance).`}
            accent="violet"
          />
        </div>
      </section>

      <section className="section-zone section-zone--missions">
        <span className="section-zone-tag">Earn XP — quick missions</span>
        <QuickActionGrid actions={quickActions} />
      </section>

      <DashboardMarketChat />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6">
        <div className="section-zone section-zone--dividends p-6 lg:col-span-6">
          <span className="section-zone-tag">Dividend calendar</span>
          <h3 className="card-header mt-1 inline-flex items-center gap-2">
            When dividends get paid
            <HelpTip text={`Each bar counts companies with a payout scheduled in that month (${exchangeConfig.code}). Taller = more dividend cash events.`} />
          </h3>
          <p className="card-subtitle">
            Taller bar = more companies paying in that month. Helps you spread income through the year.
            {dashboardStats.dividendPreview && (
              <span className="block text-amber-700 text-xs mt-1">
                Preview from Yahoo Finance leader symbols — full {exchangeConfig.code} calendar syncs quarterly.
              </span>
            )}
          </p>
          <div className="h-56 mt-4">
            {dashboardStats.hasDividendCalendar ? (
              <Bar data={chartData} options={chartOptions} />
            ) : (
              <div className="h-full flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 text-center">
                <p className="text-sm font-medium text-slate-700">No dividend calendar yet</p>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  {exchangeConfig.code} dividend profiles sync quarterly. Track {dashboardStats.symbolsTracked || 'market'}{' '}
                  symbols on the closing prices page meanwhile.
                </p>
                <Link to="/dividend-calendar" className="text-xs text-ice-700 font-semibold mt-3 hover:underline">
                  Open dividend calendar →
                </Link>
              </div>
            )}
          </div>
        </div>
        <div className="section-zone section-zone--yields p-6 lg:col-span-6">
          <span className="section-zone-tag">Top dividend yields</span>
          <h3 className="card-header mt-1 inline-flex items-center gap-2">
            Highest indicated yields
            <HelpTip
              text={
                isPsx
                  ? 'Yield = dividend per share (from PSX notice) ÷ latest saved price. High yield is not always safe — read the company announcement.'
                  : `Yield from DividendFlow database for ${exchangeConfig.code}. High yield is not always safe — do your own research.`
              }
            />
          </h3>
          <p className="card-subtitle">
            Yield = dividend per share ÷ price.
            {isPsx ? (
              <>
                {' '}
                Amounts follow PSX company notices — confirm on{' '}
                <a href="https://dps.psx.com.pk/payouts" className="text-ice-700 underline" target="_blank" rel="noopener noreferrer">
                  dps.psx.com.pk
                </a>
                .
              </>
            ) : (
              <> Amounts from cloud database — confirm with your broker or exchange filings.</>
            )}
          </p>
          <ul className="mt-4 space-y-4">
            {topYield.length === 0 ? (
              <li className="py-6 text-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-xl bg-slate-50/80">
                No yield data for {exchangeConfig.code} yet.
                {dashboardStats.symbolsTracked > 0 ? (
                  <span className="block text-xs mt-1">
                    {dashboardStats.symbolsTracked} symbols tracked — yields appear after dividend sync.
                  </span>
                ) : null}
              </li>
            ) : (
              topYield.map((d, i) => {
              const symbol = (d.Company || d.company || '').trim();
              const dps = d.Dividend_per_share || d.dividend_per_share;
              const ann = (d.Dividend_announcement || d.dividend_announcement || '').trim();
              return (
                <li key={i} className="py-3 border-b border-slate-200 last:border-0">
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0">
                      <Link to={stockPath(exchange, symbol)} className="font-semibold text-ice-700 hover:underline">
                        {symbol}
                      </Link>
                      {dps ? (
                        <p className="text-xs text-slate-500 mt-0.5">
                          {formatMoney(dps, exchangeConfig.currency)}/share
                          {d.dps_source === 'psx_announcement' && isPsx && (
                            <span className="text-emerald-700 font-medium"> · PSX notice</span>
                          )}
                        </p>
                      ) : null}
                      {ann ? (
                        <p className="text-[11px] font-mono text-slate-600 mt-1 bg-slate-50 px-2 py-0.5 rounded inline-block max-w-full truncate" title={ann}>
                          {ann}
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 px-2 py-0.5 bg-ice-50 text-ink font-semibold tabular-nums text-sm rounded-md">
                      {(d.Dividend_yield || d.dividend_yield || 0)}%
                    </span>
                  </div>
                </li>
              );
            })
            )}
          </ul>
        </div>
      </div>

      {(dailyNews.priceChanges?.length > 0) && (
        <div className="section-zone section-zone--movers p-6 animate-slide-up">
          <span className="section-zone-tag">Session movers</span>
          <h3 className="card-header mt-1">Largest advances &amp; declines</h3>
          <p className="card-subtitle">
            From the latest saved {exchangeConfig.code} close.
            {isPsx ? ' Typically after 5pm PKT.' : ''} Green = gainers, red = decliners — snapshot only, not a recommendation.
            {(tradeDate || dailyNews.priceChanges?.[0]?.Date) && (
              <span className="block text-slate-500 text-xs mt-1">
                As of {tradeDate || dailyNews.priceChanges[0].Date}
              </span>
            )}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
            <div className="p-4 border border-neutral-200 bg-neutral-50">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-600 mb-3">Top advances</h4>
              <ul className="space-y-2">
                {(dailyNews.priceChanges || []).filter(c => (parseFloat(c.ChangePct) || 0) > 0).slice(0, 5).map((c, i) => (
                  <li key={i} className="flex justify-between items-center py-2 border-b border-emerald-100 last:border-0">
                    <span className="text-slate-700 font-medium">{c.Company}</span>
                    <span className="text-emerald-600 font-bold">+{c.ChangePct}%</span>
                  </li>
                ))}
              </ul>
              {(() => {
                const gainers = (dailyNews.priceChanges || []).filter(c => (parseFloat(c.ChangePct) || 0) > 0);
                const decliners = (dailyNews.priceChanges || []).filter(c => (parseFloat(c.ChangePct) || 0) < 0);
                if (gainers.length === 0 && decliners.length === 0) {
                  return <p className="text-slate-500 text-sm py-2">No significant price changes today — all tracked stocks flat.</p>;
                }
                if (gainers.length === 0) return <p className="text-slate-600 text-sm py-2">No gainers today — all tracked stocks declined.</p>;
                return null;
              })()}
            </div>
            <div className="p-4 border border-neutral-200 bg-neutral-50">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-600 mb-3">Top declines</h4>
              <ul className="space-y-2">
                {(dailyNews.priceChanges || []).filter(c => (parseFloat(c.ChangePct) || 0) < 0).slice(0, 5).map((c, i) => (
                  <li key={i} className="flex justify-between items-center py-2 border-b border-rose-100 last:border-0">
                    <span className="text-slate-700 font-medium">{c.Company}</span>
                    <span className="text-rose-600 font-bold">{c.ChangePct}%</span>
                  </li>
                ))}
              </ul>
              {(() => {
                const gainers = (dailyNews.priceChanges || []).filter(c => (parseFloat(c.ChangePct) || 0) > 0);
                const decliners = (dailyNews.priceChanges || []).filter(c => (parseFloat(c.ChangePct) || 0) < 0);
                if (gainers.length === 0 && decliners.length === 0) return null;
                if (decliners.length === 0) return <p className="text-slate-600 text-sm py-2">No decliners today — all tracked stocks gained.</p>;
                return null;
              })()}
            </div>
          </div>
        </div>
      )}

      {alertDetailOpen && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="alert-detail-title"
          onClick={closeAlertDetail}
        >
          <div
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-white border border-slate-200 shadow-2xl shadow-slate-400/20"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-amber-50/90 to-white">
              <div>
                <h4 id="alert-detail-title" className="text-lg font-bold text-slate-900">
                  {alertDetailOpen.company}
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  {alertDetailOpen.kind === 'macro_link'
                    ? `Macro / ${exchange} headline + declining leader`
                    : alertDetailOpen.kind === 'mover'
                      ? `${exchangeConfig.code} price move`
                      : alertDetailOpen.kind === 'news'
                        ? 'Company headline + price move'
                        : 'Signal'}{' '}
                  · <span className="font-medium text-slate-600">{alertDetailOpen.level}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={closeAlertDetail}
                className="shrink-0 w-9 h-9 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 text-xl leading-none font-light"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="px-5 py-4 space-y-5">
              {typeof alertDetailOpen.priceMovePct === 'number' && alertDetailOpen.priceMovePct !== 0 && (
                <section className="rounded-xl bg-slate-100 border border-slate-200 px-3 py-2">
                  <h5 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">Session price move</h5>
                  <p className="text-sm font-semibold text-slate-800">
                    {alertDetailOpen.company}:{' '}
                    <span className={alertDetailOpen.priceMovePct < 0 ? 'text-rose-600' : 'text-emerald-600'}>
                      {alertDetailOpen.priceMovePct > 0 ? '+' : ''}
                      {alertDetailOpen.priceMovePct.toFixed(2)}%
                    </span>{' '}
                    <span className="text-slate-500 font-normal">(vs prior close in latest dataset)</span>
                  </p>
                </section>
              )}
              <section>
                <h5 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">Headline / signal</h5>
                <p className="text-base text-slate-800 leading-relaxed font-medium">{alertDetailOpen.headline}</p>
              </section>
              <section>
                <h5 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">Source</h5>
                <div className="text-sm text-slate-700">
                  {alertDetailOpen.url ? (
                    <a
                      href={alertDetailOpen.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-ice-700 font-semibold hover:underline break-all"
                    >
                      {alertDetailOpen.source}
                    </a>
                  ) : (
                    <span>{alertDetailOpen.source}</span>
                  )}
                  {alertDetailOpen.newsDate && (
                    <span className="block text-xs text-slate-500 mt-1">
                      Dated: {String(alertDetailOpen.newsDate)}
                    </span>
                  )}
                </div>
              </section>
              <section className="rounded-xl bg-slate-50 border border-slate-100 p-4">
                <h5 className="text-[11px] font-bold uppercase tracking-wide text-ink mb-2">What the AI analyzed</h5>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{alertDetailOpen.message}</p>
                {alertDetailOpen.kind === 'macro_link' && (
                  <p className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-200">
                    The headline is a broader market or policy story; this ticker is shown because it had a large down move the same
                    session — a pattern common when IMF, subsidy, or rate news hits PSX leaders.
                  </p>
                )}
              </section>
              <button
                type="button"
                onClick={closeAlertDetail}
                className="w-full py-2.5 btn-primary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <Disclaimer />
    </div>
  );
}
