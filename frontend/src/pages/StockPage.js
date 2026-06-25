import { useEffect, useState } from 'react';
import { Link, useParams, Navigate } from 'react-router-dom';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { api } from '../api';
import { getExchange } from '../config/exchanges';
import { formatMoney, formatPct } from '../utils/formatMoney';
import { getWatchlistSessionId, useExchange } from '../context/ExchangeContext';
import PageHero from '../components/ui/PageHero';
import MetricCard from '../components/ui/MetricCard';
import Disclaimer from '../components/Disclaimer';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

export default function StockPage() {
  const { exchange, symbol } = useParams();
  const { setExchange } = useExchange();
  const exCode = String(exchange || 'PSX').toUpperCase();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [watchlisted, setWatchlisted] = useState(false);
  const exCfg = getExchange('PSX');

  useEffect(() => {
    setExchange('PSX');
  }, [setExchange]);

  useEffect(() => {
    if (exCode !== 'PSX') return;
    setLoading(true);
    api
      .getStock('PSX', symbol)
      .then((res) => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [exCode, symbol]);

  useEffect(() => {
    if (exCode !== 'PSX') return;
    api
      .getWatchlist(getWatchlistSessionId())
      .then((res) => {
        const items = res.data.items || [];
        setWatchlisted(items.some((i) => i.exchange_code === 'PSX' && i.symbol === symbol?.toUpperCase()));
      })
      .catch(() => {});
  }, [exCode, symbol]);

  if (exCode !== 'PSX') {
    return <Navigate to={`/stock/PSX/${String(symbol || '').toUpperCase()}`} replace />;
  }

  async function toggleWatchlist() {
    const sid = getWatchlistSessionId();
    if (watchlisted) {
      await api.removeWatchlistItem(sid, exchange, symbol);
      setWatchlisted(false);
    } else {
      await api.addWatchlistItem(sid, exchange, symbol);
      setWatchlisted(true);
    }
  }

  if (loading) {
    return <p className="text-slate-500 text-sm">Loading {symbol}…</p>;
  }

  if (!data) {
    return (
      <div>
        <PageHero title={`${symbol} not found`} subtitle={`No data for ${exchange}`} />
        <Link to="/market-closing-prices" className="text-ice-600 text-sm font-semibold">
          ← Back to market data
        </Link>
      </div>
    );
  }

  const history = [...(data.history || [])].reverse();
  const chartData = {
    labels: history.map((h) => h.date),
    datasets: [
      {
        label: 'Close',
        data: history.map((h) => h.close),
        borderColor: '#0a0e14',
        backgroundColor: 'rgba(13,148,136,0.1)',
        tension: 0.25,
        fill: true,
      },
    ],
  };

  const m = data.metrics;
  const insight = data.aiInsight;

  return (
    <div>
      <PageHero
        title={`${data.symbol} · ${data.name}`}
        subtitle={`${exCfg.name} · ${data.sector || '—'}`}
      />

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          type="button"
          onClick={toggleWatchlist}
          className={`text-xs font-bold uppercase px-3 py-2 rounded-xl border ${
            watchlisted
              ? 'bg-amber-50 border-amber-300 text-amber-800'
              : 'bg-white border-slate-200 text-slate-600 hover:border-ice-300'
          }`}
        >
          {watchlisted ? '★ Watchlisted' : '☆ Add to watchlist'}
        </button>
        <Link
          to="/forecast-engine"
          className="text-xs font-bold uppercase px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-ice-300"
        >
          Forecast
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <MetricCard label="Last close" value={formatMoney(data.price?.close, data.currency)} />
        <MetricCard label="Change" value={formatPct(data.price?.changePct)} />
        <MetricCard label="Volume" value={data.price?.volume?.toLocaleString() || '—'} />
        <MetricCard
          label="Div yield"
          value={m?.dividend_yield != null ? formatPct(Number(m.dividend_yield) * (m.dividend_yield < 1 ? 100 : 1)) : '—'}
        />
      </div>

      {history.length > 1 && (
        <div className="card p-4 mb-6">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Price history</h3>
          <Line data={chartData} options={{ responsive: true, plugins: { legend: { display: false } } }} />
        </div>
      )}

      {(m?.pe_ratio || m?.week_52_high) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          <MetricCard label="P/E" value={m.pe_ratio?.toFixed?.(2) ?? m.pe_ratio ?? '—'} />
          <MetricCard label="52w high" value={formatMoney(m.week_52_high, data.currency)} />
          <MetricCard label="52w low" value={formatMoney(m.week_52_low, data.currency)} />
        </div>
      )}

      {data.dividends?.profile?.frequency && (
        <p className="text-sm text-slate-600 mb-4">
          Dividend frequency: <strong>{data.dividends.profile.frequency}</strong>
          {data.dividends.profile.annual_rate != null && (
            <> · Annual rate: {formatMoney(data.dividends.profile.annual_rate, data.currency)}</>
          )}
        </p>
      )}

      {data.dividends?.events?.length > 0 && (
        <div className="card p-4 mb-6">
          <h3 className="text-xs font-semibold uppercase text-slate-500 mb-3">Dividend history</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-2 pr-4">Ex-date</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2">Frequency</th>
                </tr>
              </thead>
              <tbody>
                {data.dividends.events.slice(0, 12).map((ev, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-2 pr-4">{ev.ex_date || ev.payment_date}</td>
                    <td className="py-2 pr-4">{formatMoney(ev.amount, ev.currency || data.currency)}</td>
                    <td className="py-2">{ev.frequency || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {insight?.content && (
        <div className="card p-4 mb-6 border-ice-100 bg-ice-50/40">
          <h3 className="text-xs font-semibold uppercase text-ice-700 mb-2">AI insight</h3>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{insight.content}</p>
          {insight.confidence != null && (
            <p className="text-xs text-slate-500 mt-2">Confidence: {insight.confidence}/100</p>
          )}
        </div>
      )}

      {data.news?.length > 0 && (
        <div className="card p-4 mb-6">
          <h3 className="text-xs font-semibold uppercase text-slate-500 mb-3">News</h3>
          <ul className="space-y-2 text-sm">
            {data.news.map((n, i) => (
              <li key={i}>
                {n.url ? (
                  <a href={n.url} target="_blank" rel="noreferrer" className="text-ice-700 hover:underline">
                    {n.headline}
                  </a>
                ) : (
                  n.headline
                )}
                {n.published_date && (
                  <span className="text-slate-400 ml-2 text-xs">{n.published_date}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Disclaimer />
    </div>
  );
}
