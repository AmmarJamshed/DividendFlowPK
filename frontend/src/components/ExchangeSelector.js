import { useExchange } from '../context/ExchangeContext';
import { EXCHANGES } from '../config/exchanges';

export default function ExchangeSelector({ compact = false, prominent = false }) {
  const { exchange, setExchange, exchangeConfig } = useExchange();

  if (prominent) {
    return (
      <label className="inline-flex flex-col gap-1">
        <select
          value={exchange}
          onChange={(e) => setExchange(e.target.value)}
          className="rounded-xl border-2 border-teal-400 bg-white px-4 py-2.5 text-base font-bold text-slate-800 shadow-sm focus:outline-none focus:ring-4 focus:ring-teal-400/30 min-w-[12rem]"
          aria-label="Select stock exchange"
        >
          {EXCHANGES.map((ex) => (
            <option key={ex.code} value={ex.code}>
              {ex.name} ({ex.currency})
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label
      className={`inline-flex items-center gap-1.5 rounded-lg border ${
        compact ? 'border-slate-200 bg-white px-1.5 py-0.5 text-xs' : 'border-teal-300 bg-teal-50/80 px-2 py-1 text-sm'
      }`}
    >
      <span className="text-slate-500 shrink-0 hidden sm:inline font-semibold">Market</span>
      <select
        value={exchange}
        onChange={(e) => setExchange(e.target.value)}
        className={`rounded-md bg-transparent font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-400/60 ${
          compact ? 'max-w-[7rem] py-0.5' : 'min-w-[6.5rem] py-0.5'
        }`}
        aria-label="Select exchange"
        title={`${exchangeConfig.name} · ${exchangeConfig.currency}`}
      >
        {EXCHANGES.map((ex) => (
          <option key={ex.code} value={ex.code}>
            {compact ? ex.code : `${ex.code} · ${ex.currency}`}
          </option>
        ))}
      </select>
    </label>
  );
}
