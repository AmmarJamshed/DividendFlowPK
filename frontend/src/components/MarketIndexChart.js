import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip, Legend);

function formatIndex(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString('en-PK', { maximumFractionDigits: 2 });
}

export default function MarketIndexChart({ series, loading }) {
  if (loading) {
    return (
      <div className="h-[280px] flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-[#1E3A8A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const points = series?.points || [];
  if (!points.length) {
    return (
      <div className="h-[280px] flex items-center justify-center text-sm text-slate-500">
        Index history will appear after price data is ingested.
      </div>
    );
  }

  const labels = points.map((p) => {
    const d = new Date(`${p.date}T12:00:00`);
    return d.toLocaleDateString('en-PK', { month: 'short', day: 'numeric' });
  });
  const closes = points.map((p) => p.close);
  const latest = series?.latest;
  const changePct = latest?.changePct ?? 0;
  const positive = changePct >= 0;

  const lineData = {
    labels,
    datasets: [
      {
        label: series?.label || 'Index',
        data: closes,
        borderColor: '#1E3A8A',
        backgroundColor: 'rgba(30, 58, 138, 0.08)',
        fill: true,
        tension: 0.25,
        pointRadius: 0,
        pointHoverRadius: 3,
        borderWidth: 2,
      },
    ],
  };

  const volumeData = {
    labels,
    datasets: [
      {
        label: 'Breadth',
        data: points.map((p) => p.volume || 0),
        backgroundColor: 'rgba(249, 115, 22, 0.35)',
        borderRadius: 2,
      },
    ],
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            {series?.label || 'KSE-100'} · Session proxy
          </p>
          <p className="text-2xl font-extrabold text-slate-900 tabular-nums mt-1">
            {formatIndex(latest?.close)}
          </p>
          {latest && (
            <p className={`text-sm font-semibold tabular-nums mt-0.5 ${positive ? 'text-emerald-600' : 'text-red-600'}`}>
              {positive ? '+' : ''}
              {formatIndex(latest.change)} ({positive ? '+' : ''}
              {changePct.toFixed(2)}%)
            </p>
          )}
        </div>
        <p className="text-[11px] text-slate-500 max-w-xs leading-relaxed">{series?.subtitle}</p>
      </div>
      <div className="h-[200px]">
        <Line
          data={lineData}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { display: false }, ticks: { maxTicksLimit: 8, font: { size: 10 } } },
              y: {
                position: 'right',
                grid: { color: 'rgba(148,163,184,0.2)' },
                ticks: { font: { size: 10 }, callback: (v) => formatIndex(v) },
              },
            },
          }}
        />
      </div>
      <div className="h-[48px] mt-2">
        <Bar
          data={volumeData}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: {
              x: { display: false },
              y: { display: false },
            },
          }}
        />
      </div>
    </div>
  );
}
