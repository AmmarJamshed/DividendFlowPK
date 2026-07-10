import { Link } from 'react-router-dom';
import CompanyLogo from './CompanyLogo';
import { stockPath } from '../config/exchanges';
import { isShariahCompliant } from '../utils/psxShariah';

function formatNum(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString('en-PK', { maximumFractionDigits: 2 });
}

function formatPct(n) {
  if (n == null || Number.isNaN(n)) return '—';
  const v = Number(n);
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

function displayName(row) {
  const sym = row.symbol || '';
  const name = (row.company || '').trim();
  if (name && name !== sym && !/^\d+$/.test(name)) return name;
  return sym || '—';
}

export default function StockBusinessCard({ row, exchange }) {
  const positive = (row.changePct || 0) >= 0;
  const name = displayName(row);
  const shariah = exchange === 'PSX' && isShariahCompliant(row.symbol);

  return (
    <Link
      to={stockPath(exchange, row.symbol)}
      className="df-card group flex flex-col p-4 hover:border-[#1E3A8A]/40 hover:shadow-md transition-all"
    >
      <div className="flex items-start gap-3">
        <CompanyLogo
          symbol={row.symbol}
          name={name}
          className="w-14 h-14"
          rounded="rounded-2xl"
        />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-slate-900 text-sm leading-snug line-clamp-2 group-hover:text-[#1E3A8A]">
            {name}
          </p>
          <p className="text-xs font-mono font-semibold text-slate-500 mt-0.5">{row.symbol}</p>
          {shariah && (
            <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
              Shariah
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 flex items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Price</p>
          <p className="text-xl font-extrabold text-slate-900 tabular-nums leading-none mt-1">
            {formatNum(row.close)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Change</p>
          <p
            className={`text-lg font-extrabold tabular-nums leading-none mt-1 ${
              row.changePct == null ? 'text-slate-400' : positive ? 'text-emerald-600' : 'text-red-600'
            }`}
          >
            {row.changePct != null ? formatPct(row.changePct) : '—'}
          </p>
        </div>
      </div>

      {(row.dividendYield != null || row.volume != null) && (
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
          {row.dividendYield != null && (
            <span>
              Yield <strong className="text-slate-700">{formatNum(row.dividendYield)}%</strong>
            </span>
          )}
          {row.volume != null && row.volume > 0 && (
            <span>
              Vol <strong className="text-slate-700">{formatNum(row.volume)}</strong>
            </span>
          )}
        </div>
      )}
    </Link>
  );
}
