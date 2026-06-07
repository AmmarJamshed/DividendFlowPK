import { useExchange } from '../context/ExchangeContext';
import { EXCHANGES } from '../config/exchanges';

export default function ExchangeSelector({ compact = false }) {
  const { exchange, setExchange } = useExchange();

  return (
    <label className={`inline-flex items-center gap-1.5 ${compact ? 'text-xs' : 'text-sm'}`}>
      <span className="text-slate-500 shrink-0 hidden sm:inline">Market</span>
      <select
        value={exchange}
        onChange={(e) => setExchange(e.target.value)}
        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-teal-400/60 max-w-[9rem] sm:max-w-none"
        aria-label="Select exchange"
      >
        {EXCHANGES.map((ex) => (
          <option key={ex.code} value={ex.code}>
            {ex.code}
          </option>
        ))}
      </select>
    </label>
  );
}
