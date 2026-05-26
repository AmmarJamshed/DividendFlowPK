/**
 * KPI tile with brand accent and hover feedback.
 */
export default function MetricCard({ label, value, hint, trend, accent = 'gold' }) {
  const topBorder = accent === 'emerald' ? 'border-t-[#11836a]' : 'border-t-[#c5a667]';

  return (
    <div className={`metric-card bg-white border border-slate-200 border-t-2 ${topBorder} p-5 relative overflow-hidden`}>
      <div
        className="absolute right-0 top-0 h-16 w-16 opacity-25 pointer-events-none"
        style={{
          background:
            accent === 'emerald'
              ? 'radial-gradient(circle at top right, #11836a, transparent 70%)'
              : 'radial-gradient(circle at top right, #c5a667, transparent 70%)',
        }}
        aria-hidden="true"
      />
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="text-2xl sm:text-3xl font-bold text-slate-900 mt-2 tabular-nums leading-none tracking-tight">
        {value}
      </p>
      {hint && <p className="text-xs text-slate-600 mt-2 leading-snug">{hint}</p>}
      {trend && <p className="text-xs font-semibold mt-2 text-emerald-700">{trend}</p>}
    </div>
  );
}
