import { Link } from 'react-router-dom';
import CompanyLogo from './CompanyLogo';
import { stockPath } from '../config/exchanges';

function formatPct(n) {
  if (n == null || Number.isNaN(n)) return '—';
  const v = Number(n);
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

function MoverRow({ row, exchange }) {
  const positive = (row.changePct || 0) >= 0;
  return (
    <Link
      to={stockPath(exchange, row.symbol)}
      className="flex items-center gap-2.5 py-2 border-b border-slate-100 last:border-0 hover:bg-slate-50/80 px-1 rounded-lg transition-colors"
    >
      <CompanyLogo symbol={row.symbol} className="w-7 h-7" />
      <span className="flex-1 min-w-0 text-sm font-semibold text-slate-800 truncate">{row.symbol}</span>
      <span className={`text-sm font-bold tabular-nums ${positive ? 'text-emerald-600' : 'text-red-600'}`}>
        {formatPct(row.changePct)}
      </span>
      <span className={`text-xs ${positive ? 'text-emerald-500' : 'text-red-500'}`} aria-hidden>
        {positive ? '▲' : '▼'}
      </span>
    </Link>
  );
}

export default function MarketMoversPanel({ title, rows, exchange }) {
  return (
    <div className="df-card overflow-hidden flex flex-col min-h-[200px]">
      <div className="bg-[#1E3A8A] text-white px-4 py-2.5 text-sm font-bold">{title}</div>
      <div className="p-3 flex-1">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">No movers in this session.</p>
        ) : (
          rows.map((row) => <MoverRow key={row.symbol} row={row} exchange={exchange} />)
        )}
      </div>
    </div>
  );
}
