import { useExchange } from '../context/ExchangeContext';
import ExchangeSelector from './ExchangeSelector';

const EXCHANGE_ACCENTS = {
  PSX: 'from-emerald-500 to-teal-600',
  NYSE: 'from-blue-600 to-indigo-600',
  NASDAQ: 'from-violet-600 to-purple-600',
  HKEX: 'from-rose-500 to-orange-500',
  LSE: 'from-sky-600 to-blue-700',
  TSE: 'from-red-500 to-rose-600',
  SSE: 'from-amber-500 to-red-600',
  TADAWUL: 'from-green-600 to-emerald-700',
};

export default function ExchangeMarketBanner() {
  const { exchange, exchangeConfig } = useExchange();
  const gradient = EXCHANGE_ACCENTS[exchange] || 'from-teal-500 to-cyan-600';

  return (
    <div
      className="mb-6 sm:mb-8 rounded-2xl border-2 border-slate-200 bg-white shadow-lg shadow-slate-200/60 overflow-hidden"
      role="region"
      aria-label="Active market"
    >
      <div className={`h-1.5 w-full bg-gradient-to-r ${gradient}`} aria-hidden />
      <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-1">
            Viewing market
          </p>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {exchangeConfig.name}
            </h2>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-slate-100 text-sm font-bold text-slate-700 border border-slate-200">
              {exchange}
            </span>
            <span className="text-sm font-semibold text-teal-700">{exchangeConfig.currency}</span>
          </div>
          <p className="mt-2 text-sm text-slate-600 max-w-xl">
            Overview, market data, dividends, and Market Buddy all reflect{' '}
            <strong className="text-slate-800">{exchangeConfig.code}</strong>. Switch market below or in the header —
            the page reloads data automatically.
          </p>
        </div>
        <div className="shrink-0 flex flex-col items-stretch sm:items-end gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-right">
            Change market
          </span>
          <ExchangeSelector prominent />
        </div>
      </div>
    </div>
  );
}
